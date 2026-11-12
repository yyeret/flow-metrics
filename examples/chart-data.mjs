import { readFileSync } from 'node:fs';
import { createFlow, percentile } from '../index.mjs';

const profiles = {
  simple: { file: 'simple-flow.json', asOf: 27 },
  sle: { file: 'sle-flow.json', asOf: 111, baseline: { from: 21, through: 90 } },
};
const name = process.argv[2] ?? 'simple';
if (!Object.hasOwn(profiles, name)) {
  throw new Error('Choose the simple or sle chart example.');
}

const { file, asOf, baseline } = profiles[name];
const dataset = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const flow = createFlow(dataset);
const { stages, terminalStages } = dataset;
const activeStages = stages.filter(stage => !terminalStages.includes(stage));

// Day -1 is the empty baseline. Sample the state at the end of each day.
const daily = Array.from({ length: asOf + 2 }, (_, index) => {
  const { asOf: day, counts, wip } = flow.snapshot(index - 1);
  return { day, counts, wip };
});

const weekly = [];
let previouslyEntered = 0;
for (let end = 6; end <= asOf; end += 7) {
  const { entered, throughput } = flow.snapshot(end, { throughputSince: end - 7 });
  weekly.push({ start: end - 6, end, throughput, started: entered - previouslyEntered });
  previouslyEntered = entered;
}

const snapshot = flow.snapshot(asOf);
// Both fixtures use calendar-day indices. Include the start day in chart durations.
const finished = snapshot.items.filter(item => item.cycleTime !== null)
  .map(item => ({ ...item, cycleDays: item.cycleTime + 1 }));
const active = snapshot.items.filter(item => item.workItemAge !== null)
  .map(item => ({ ...item, ageDays: item.workItemAge + 1, stageDays: item.stageAge + 1 }));

const { from, through } = baseline ?? { from: 0, through: asOf };
const referenceItems = flow.snapshot(through).items
  .filter(item => item.finishedAt !== null && item.finishedAt >= from);
const reference = {
  from,
  through,
  size: referenceItems.length,
  days: percentile(referenceItems.map(item => item.cycleTime + 1), 0.85),
  isSle: baseline !== undefined,
};

// Both examples are forward-only. Entry to the next stage marks exit from this one.
const referenceIds = new Set(referenceItems.map(item => item.id));
const milestones = flow.durationSamples(through, stages.slice(1))
  .filter(event => referenceIds.has(event.id));
const pace = Object.fromEntries(activeStages.map((stage, index) => {
  const exitAges = milestones.filter(event => event.stage === stages[index + 1])
    .map(event => event.duration + 1);
  return [stage, [0.5, 0.7, 0.85, 0.95].map(probability => percentile(exitAges, probability))];
}));

console.log(JSON.stringify({
  stages, activeStages, asOf, daily, weekly, finished, active, reference, pace,
}, null, 2));
