// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Yuval Yeret
const FlowMetrics = (() => {
  function checkTime(value, name) {
    if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  }

  function checkStages(selected, known, name) {
    if (!Array.isArray(selected)) throw new TypeError(`${name} must be an array`);
    for (const stage of selected) {
      if (!known.has(stage)) throw new RangeError(`${name} contains an unknown stage`);
    }
  }

  function normalizeTransitions(transitions, stages, terminal, id) {
    if (!Array.isArray(transitions) || transitions.length === 0) {
      throw new TypeError(`${id} needs at least one transition`);
    }
    const history = [];
    let previousTime = -Infinity;
    for (const { at, stage } of transitions) {
      checkTime(at, `Transition time for ${id}`);
      if (at < previousTime) throw new RangeError(`${id} transitions must be chronological`);
      if (!stages.has(stage)) throw new RangeError(`unknown stage ${stage} for ${id}`);
      previousTime = at;

      const previous = history.at(-1);
      if (stage === previous?.stage) continue;
      const finishedAt = terminal.has(stage) ? (previous?.finishedAt ?? at) : null;
      history.push({ at, stage, finishedAt });
    }
    return history;
  }

  function readItem(id, history, asOf) {
    const current = history.findLast(event => event.at <= asOf);
    if (!current) return null;
    const startedAt = history[0].at;
    const { stage, at: stageEnteredAt, finishedAt } = current;
    const open = finishedAt === null;
    return {
      id, stage, startedAt, stageEnteredAt, finishedAt,
      workItemAge: open ? elapsed(startedAt, asOf) : null,
      stageAge: open ? elapsed(stageEnteredAt, asOf) : null,
      cycleTime: open ? null : elapsed(startedAt, finishedAt),
    };
  }

  function createFlow({ stages, terminalStages, items }) {
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new TypeError('stages must contain nonempty names');
    }
    for (const stage of stages) {
      if (typeof stage !== 'string' || stage.trim() === '') {
        throw new TypeError('stages must contain nonempty names');
      }
    }
    const known = new Set(stages);
    if (known.size !== stages.length) throw new RangeError('duplicate workflow stage');
    checkStages(terminalStages, known, 'terminalStages');
    if (terminalStages.length === 0) throw new RangeError('declare at least one terminal stage');
    if (!Array.isArray(items)) throw new TypeError('items must be an array');

    const terminal = new Set(terminalStages);
    const histories = new Map();
    for (const { id, transitions } of items) {
      if (typeof id !== 'string' || id.trim() === '') throw new TypeError('item id must be a nonempty string');
      if (histories.has(id)) throw new RangeError(`duplicate item id ${id}`);
      histories.set(id, normalizeTransitions(transitions, known, terminal, id));
    }

    function itemAt(id, asOf) {
      checkTime(asOf, 'asOf');
      const history = histories.get(id);
      return history ? readItem(id, history, asOf) : null;
    }

    function snapshot(asOf, { throughputSince } = {}) {
      checkTime(asOf, 'asOf');
      if (throughputSince !== undefined) {
        checkTime(throughputSince, 'throughputSince');
        if (throughputSince > asOf) throw new RangeError('throughputSince must be at or before asOf');
      }
      const counts = Object.fromEntries([...known].map(stage => [stage, 0]));
      const items = [];
      let completed = 0;
      let throughput = 0;
      let oldestAge = null;
      for (const [id, history] of histories) {
        const reading = readItem(id, history, asOf);
        if (!reading) continue;
        items.push(reading);
        counts[reading.stage]++;
        if (reading.finishedAt === null) {
          oldestAge = Math.max(oldestAge ?? 0, reading.workItemAge);
        } else {
          completed++;
          if (throughputSince === undefined || reading.finishedAt > throughputSince) throughput++;
        }
      }
      return { asOf, counts, entered: items.length, completed, wip: items.length - completed,
        throughput, oldestAge, items };
    }

    function durationSamples(asOf, milestoneStages) {
      checkTime(asOf, 'asOf');
      checkStages(milestoneStages, known, 'milestoneStages');
      const selected = new Set(milestoneStages);
      const samples = [];
      for (const [id, history] of histories) {
        const startedAt = history[0].at;
        for (const { at, stage } of history) {
          if (at > asOf) break;
          if (selected.has(stage)) samples.push({ id, at, stage, duration: elapsed(startedAt, at) });
        }
      }
      return samples.sort((a, b) => {
        if (a.at !== b.at) return a.at - b.at;
        if (a.id === b.id) return 0;
        return a.id < b.id ? -1 : 1;
      });
    }

    return { itemAt, snapshot, durationSamples };
  }

  function finiteValues(values) {
    if (!Array.isArray(values)) return false;
    for (const value of values) {
      if (!Number.isFinite(value)) return false;
    }
    return true;
  }

  function elapsed(start, end, units = 1) {
    return (end - start) / units;
  }

  function checkOrder(times) {
    if (!finiteValues(times) || times.some((time, index) => index > 0 && time < times[index - 1])) {
      throw new RangeError('sample times must be finite and chronological');
    }
  }

  function insertionIndex(times, target, afterEqual = false) {
    let low = 0;
    let high = times.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const time = times[middle];
      if (time < target || (afterEqual && time === target)) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function countIntervals(intervals, samples) {
    checkOrder(samples);
    const changes = new Array(samples.length + 1).fill(0);
    for (const [start, end] of intervals) {
      checkTime(start, 'interval start');
      if (end !== null) checkTime(end, 'interval end');
      if (end !== null && end <= start) continue;
      changes[insertionIndex(samples, start)]++;
      changes[end === null ? samples.length : insertionIndex(samples, end)]--;
    }
    let count = 0;
    return samples.map((_, index) => {
      count += changes[index];
      return count;
    });
  }

  function countEventsInWindows(events, boundaries) {
    checkOrder(boundaries);
    if (!finiteValues(events)) throw new TypeError('event times must be finite');
    if (boundaries.length < 2) return [];
    const ordered = [...events].sort((a, b) => a - b);
    let previous = insertionIndex(ordered, boundaries[0], true);
    return boundaries.slice(1).map(end => {
      const current = insertionIndex(ordered, end, true);
      const count = current - previous;
      previous = current;
      return count;
    });
  }

  function percentile(values, probability, { method = 'nearest-rank' } = {}) {
    if (!Number.isFinite(probability) || probability <= 0 || probability > 1) {
      throw new RangeError('probability must be in (0, 1]');
    }
    if (!finiteValues(values)) throw new TypeError('values must contain finite numbers');
    if (method !== 'nearest-rank' && method !== 'upper-index') {
      throw new RangeError('unknown percentile method');
    }
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const position = sorted.length * probability;
    const index = method === 'upper-index'
      ? Math.min(Math.floor(position), sorted.length - 1)
      : Math.ceil(position) - 1;
    return sorted[index];
  }

  function histogram(values, count = 6) {
    if (!Number.isInteger(count) || count < 1) throw new RangeError('count must be a positive integer');
    if (!finiteValues(values)) throw new TypeError('values must contain finite numbers');
    if (values.length === 0) return [];
    let min = values[0];
    let max = values[0];
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const width = (max - min || 1) / count;
    if (!Number.isFinite(width) || width === 0) {
      throw new RangeError('values cannot be divided into bins at this numeric scale');
    }
    const bins = Array.from({ length: count }, (_, index) => ({
      from: min + index * width, to: min + (index + 1) * width, count: 0,
    }));
    if (min === max) {
      bins[0].count = values.length;
      return bins;
    }
    bins[count - 1].to = max;
    for (const value of values) {
      let low = 0;
      let high = count - 1;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (value < bins[middle].to) high = middle;
        else low = middle + 1;
      }
      bins[low].count++;
    }
    return bins;
  }

  function individualsMovingRange(values, { baseline = values.length, minimumBaseline = 2 } = {}) {
    if (!Number.isInteger(minimumBaseline) || minimumBaseline < 2 || !Number.isInteger(baseline)) {
      throw new RangeError('baseline and minimumBaseline must be integers, with minimumBaseline at least 2');
    }
    if (!finiteValues(values) || baseline < minimumBaseline || values.length < baseline) {
      return { available: false, signals: [], values };
    }
    const center = values.slice(0, baseline).reduce((sum, value) => sum + value, 0) / baseline;
    const mr = values.slice(1).map((value, index) => Math.abs(value - values[index]));
    const mrMean = mr.slice(0, baseline - 1).reduce((sum, value) => sum + value, 0) / (baseline - 1);
    const limitDistance = 3 * mrMean / 1.128;
    const upper = center + limitDistance;
    const lower = center - limitDistance;
    const mrUpper = 3.267 * mrMean;
    const signals = [];
    let run = 0;
    let side = 0;
    values.forEach((value, index) => {
      const nextSide = Math.sign(value - center);
      run = nextSide === side ? run + 1 : 1;
      side = nextSide;
      if (value > upper || value < lower) signals.push({ index, rule: 'outside limits' });
      if (side !== 0 && run >= 8) signals.push({ index, rule: '8 on one side' });
      if (index > 0 && mr[index - 1] > mrUpper) signals.push({ index, rule: 'moving range outside limits' });
    });
    return { available: true, values, baseline, center, upper, lower, mr, mrMean, mrUpper, signals };
  }

  return Object.freeze({ countEventsInWindows, countIntervals, createFlow, elapsed, histogram, individualsMovingRange, percentile });
})();

if (typeof module === 'object' && module?.exports) module.exports = FlowMetrics;
