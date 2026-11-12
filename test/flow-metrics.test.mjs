import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import vm from 'node:vm';
import { createFlow, histogram, individualsMovingRange, percentile } from '@yyeret/flow-metrics';

const workflow = {
  stages: ['ready', 'working', 'review', 'delivered', 'declined'],
  terminalStages: ['delivered', 'declined'],
};
const item = (id, ...events) => ({
  id,
  transitions: events.map(([at, stage]) => ({ at, stage })),
});
const sample = createFlow({
  ...workflow,
  items: [
    item('a', [0, 'ready'], [1, 'working'], [4, 'delivered']),
    item('b', [2, 'ready'], [3, 'working'], [3, 'review'], [5, 'declined']),
    item('c', [6, 'working']),
  ],
});

test('counts, open ages and completed cycle times respect the as-of and throughput boundaries', () => {
  const before = sample.snapshot(3);
  assert.deepEqual(before.counts, { ready: 0, working: 1, review: 1, delivered: 0, declined: 0 });
  assert.equal(before.entered, 2);
  assert.equal(before.wip, 2);
  assert.equal(before.oldestAge, 3);
  assert.deepEqual(before.items[1], {
    id: 'b', stage: 'review', startedAt: 2, stageEnteredAt: 3, finishedAt: null,
    workItemAge: 1, stageAge: 0, cycleTime: null,
  });

  const after = sample.snapshot(5, { throughputSince: 4 });
  assert.equal(after.throughput, 1);
  assert.equal(after.completed, 2);
  assert.equal(after.wip, 0);
  assert.equal(after.oldestAge, null);
  assert.deepEqual(after.items.map(({ cycleTime, workItemAge }) => [cycleTime, workItemAge]),
    [[4, null], [3, null]]);
  assert.deepEqual(sample.snapshot(5, { throughputSince: 5 }).throughput, 0);
});

test('a reopened case ages from its original start and a terminal relabel is one completion', () => {
  const flow = createFlow({
    ...workflow,
    items: [item('reopened', [0, 'ready'], [3, 'delivered'], [4, 'working'],
      [5, 'working'], [8, 'delivered'], [9, 'declined'])],
  });
  assert.equal(flow.itemAt('reopened', 2).stage, 'ready');
  assert.equal(flow.itemAt('reopened', 5).stageAge, 1);
  assert.equal(flow.itemAt('reopened', 5).workItemAge, 5);
  assert.equal(flow.snapshot(5).completed, 0);
  assert.equal(flow.itemAt('reopened', 9).cycleTime, 8);
  assert.equal(flow.itemAt('reopened', 9).stage, 'declined');
  assert.equal(flow.snapshot(9, { throughputSince: 8 }).throughput, 0);
});

test('milestone samples include equal-time transitions in order and omit future events', () => {
  assert.deepEqual(sample.durationSamples(4, ['working', 'review']), [
    { id: 'a', at: 1, stage: 'working', duration: 1 },
    { id: 'b', at: 3, stage: 'working', duration: 1 },
    { id: 'b', at: 3, stage: 'review', duration: 1 },
  ]);
  assert.deepEqual(sample.durationSamples(-1, ['review']), []);
  assert.equal(sample.itemAt('c', 5), null);
  assert.equal(sample.itemAt('missing', 5), null);
});

test('invalid histories are rejected instead of contributing guessed readings', () => {
  assert.throws(() => createFlow({ ...workflow, items: [item('a', [0, 'unknown'])] }), /unknown stage/);
  assert.throws(() => createFlow({ ...workflow, items: [item('a', [1, 'ready'], [0, 'working'])] }), /chronological/);
  assert.throws(() => createFlow({ ...workflow, items: [item('a', [NaN, 'ready'])] }), /finite/);
  assert.throws(() => createFlow({ ...workflow, items: [item('a', [0, 'ready']), item('a', [1, 'ready'])] }), /duplicate/);
  assert.throws(() => sample.snapshot(5, { throughputSince: 6 }), /throughputSince/);
  const sparseStages = new Array(2);
  sparseStages[1] = 'delivered';
  assert.throws(() => createFlow({ ...workflow, stages: sparseStages, items: [] }), /nonempty names/);
});

test('nearest rank and histogram preserve units, maximum and empty observations', () => {
  const values = [8, 1, 4, 6, 5];
  assert.equal(percentile(values, 0.5), 5);
  assert.equal(percentile(values, 0.85), 8);
  assert.equal(percentile([], 0.85), null);
  assert.deepEqual(values, [8, 1, 4, 6, 5]);
  assert.deepEqual(histogram([0, 1, 2, 3, 4], 2), [
    { from: 0, to: 2, count: 2 }, { from: 2, to: 4, count: 3 },
  ]);
  assert.deepEqual(histogram([], 3), []);
  assert.throws(() => histogram([0, Number.MIN_VALUE]), /numeric scale/);
});

test('histograms assign values on reported edges to the bin starting there', () => {
  const bins = histogram([0, 9, 18], 14);
  assert.equal(bins[7].from, 9);
  assert.equal(bins[6].count, 0);
  assert.equal(bins[7].count, 1);
  assert.equal(bins.at(-1).count, 1);
  assert.equal(histogram([0, 1], 49).at(-1).to, 1);
});

test('the classic and CommonJS entries expose the same working library as ESM', () => {
  const require = createRequire(import.meta.url);
  assert.equal(require('@yyeret/flow-metrics').createFlow, createFlow);
  const classic = readFileSync(require.resolve('@yyeret/flow-metrics/classic'), 'utf8');
  const browser = vm.createContext({});
  vm.runInContext(classic, browser);
  const count = vm.runInContext(`
    const flow = FlowMetrics.createFlow({
      stages: ['started', 'done'],
      terminalStages: ['done'],
      items: [{ id: '1', transitions: [{ at: 0, stage: 'started' }] }],
    });
    flow.snapshot(3).wip;
  `, browser);
  assert.equal(count, 1);
});

test('I-MR holds the declared baseline constant and detects a later shift', () => {
  const values = [10, 11, 10, 11, ...Array(8).fill(30)];
  const result = individualsMovingRange(values, { baseline: 4, minimumBaseline: 4 });
  assert.equal(result.available, true);
  assert.equal(result.center, 10.5);
  assert.equal(result.mrMean, 1);
  assert.ok(result.signals.some(({ index, rule }) => index === 4 && rule === 'outside limits'));
  assert.ok(result.signals.some(({ index, rule }) => index === 11 && rule === '8 on one side'));
  assert.equal(individualsMovingRange([10], { baseline: 4 }).available, false);
});
