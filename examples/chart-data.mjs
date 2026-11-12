import { readFileSync } from 'node:fs';
import { createFlow, percentile } from '../index.mjs';

const dataset = JSON.parse(readFileSync(new URL('./simple-flow.json', import.meta.url), 'utf8'));
const flow = createFlow(dataset);
const asOf = 27;

// Day -1 is the empty baseline. Sample the state at the end of each day.
const daily = Array.from({ length: asOf + 2 }, (_, index) => {
  const { asOf: day, counts, wip } = flow.snapshot(index - 1);
  return { day, counts, wip };
});

const weekly = [6, 13, 20, asOf].map(end => {
  const { throughput } = flow.snapshot(end, { throughputSince: end - 7 });
  return { start: end - 6, end, throughput };
});

const snapshot = flow.snapshot(asOf);
const finished = snapshot.items.filter(item => item.cycleTime !== null);
const active = snapshot.items.filter(item => item.workItemAge !== null);

console.log(JSON.stringify({
  stages: dataset.stages,
  activeStages: dataset.stages.filter(stage => !dataset.terminalStages.includes(stage)),
  asOf,
  daily,
  weekly,
  finished,
  active,
  p85: percentile(finished.map(item => item.cycleTime), 0.85),
}, null, 2));
