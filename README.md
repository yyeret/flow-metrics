# Flow Metrics

A JavaScript library for measuring how work moves through a workflow. Give it timestamped stage changes for each work item. It returns stage counts for cumulative flow diagrams, work in progress (WIP), work item age, cycle time, and throughput. It runs in Node.js or a classic browser script with zero runtime dependencies.

Yuval Yeret’s [Flow Metrics for Scrum](https://yuvalyeret.com/blog/4-key-flow-metrics-and-how-to-use-them-in-scrums-events/) explains the four measures and when to act on them. The [flow metrics guide](docs/flow-metrics-guide.md) covers definitions, implementation choices, and further reading from Yuval, Scrum.org, and ProKanban.

## Use it

Node.js 22 or later is supported. Install the [GitHub release package](https://github.com/yyeret/flow-metrics/releases/tag/v0.1.0) in your project.

```sh
npm install https://github.com/yyeret/flow-metrics/releases/download/v0.1.0/yyeret-flow-metrics-0.1.0.tgz
```

From a source checkout, you can also run `npm pack` and install the resulting tarball. For a browser page, load [flow-metrics.js](flow-metrics.js) as a classic script and use `FlowMetrics.createFlow` from a subsequent script. Keep the [license](LICENSE) with any copy you distribute.

```js
import { createFlow, percentile } from '@yyeret/flow-metrics';

const delivery = createFlow({
  stages: ['implementing', 'review', 'released'],
  terminalStages: ['released'],
  items: [
    { id: 'change-1', transitions: [
      { at: 0, stage: 'implementing' },
      { at: 3, stage: 'review' },
      { at: 7, stage: 'released' },
    ] },
    { id: 'change-2', transitions: [
      { at: 5, stage: 'implementing' },
    ] },
  ],
});

const today = delivery.snapshot(9, { throughputSince: 2 });
console.log(today.counts);       // { implementing: 1, review: 0, released: 1 }
console.log(today.wip);          // 1
console.log(today.throughput);   // 1 completion in (2, 9]
console.log(today.oldestAge);    // 4 days

const cycleTimes = today.items.flatMap(item =>
  item.cycleTime === null ? [] : [item.cycleTime]
);
console.log(percentile(cycleTimes, 0.85)); // 7 days, based on one completed case

const cfd = [0, 3, 6, 9].map(day => delivery.snapshot(day).counts);
```

CommonJS uses `const { createFlow } = require('@yyeret/flow-metrics')`. The example uses elapsed days. For event logs, convert timezone-qualified timestamps to epoch milliseconds and use the same unit for event times, snapshots, and reporting windows.

The same input works for sales, billing, or any workflow with a defined start and finish. To measure elapsed time to an intermediate stage, call `durationSamples(asOf, ['review'])`.

Run `npm test` to verify the calculations. The library is available under the [MIT License](LICENSE).
