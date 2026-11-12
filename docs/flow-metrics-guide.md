# Measuring flow from events

Start with a decision. If changes pile up in review, look at how long they have waited and how many finish each week. Pick a unit of work and define the events that start and finish the interval you need to understand.

## Map a workflow

1. Assign a stable ID to each item. Choose the same level of work across the cohort, such as software changes moving through one delivery workflow.
2. Put the first measured event at the start of each history. An item's creation date and the start of work can be different. Provide the event that matches your workflow policy.
3. Map source events to named stages, including each exit you want to distinguish. Sort each history by time and preserve source order for ties. Use one numeric unit across the workflow and include explicit time offsets when parsing timestamps.
4. Choose an observation date and a reporting window. Include items that started before the window when they could still be open or finish inside it. Track exclusions for missing histories. When an event is unknown, the application should decide whether to exclude that item or report a separate cohort with incomplete data.

`createFlow({ stages, terminalStages, items })` validates and copies the histories. It requires nonempty unique item IDs, known stage names, finite timestamps, and chronological events. The latest transition at or before the observation time determines the stage. A repeated transition to the same stage leaves its entry time intact.

## Read the measures

| Measure | Interpretation |
| --- | --- |
| WIP | Items that have entered and are in a nonterminal stage at the observation time. |
| Work item age | Elapsed time from start to the observation time for an open item. Stage age starts when it entered its current stage. |
| Cycle time | Elapsed time from start to the first terminal entry since the item started or last reopened. |
| Throughput | Count of distinct items in a terminal stage at the observation time whose current completion falls inside the reporting window. |

`snapshot(asOf, { throughputSince })` uses the interval `(throughputSince, asOf]`. If you omit `throughputSince`, throughput is the completed count as of that time. Reopening puts the item back into WIP and revokes the previous completion for subsequent snapshots. It retains the original start. Changing from one terminal outcome to another keeps the completion time. If the work repeats as a separate delivery, give each delivery its own ID.

`itemAt(id, asOf)` returns the same per-item reading as the snapshot or `null` before the start or for an unknown ID. Open items have `workItemAge` and `stageAge`. Finished items have `cycleTime` and `finishedAt`. Inapplicable durations are `null`. `durationSamples(asOf, stages)` returns elapsed time from the first measured event to each entry into a selected stage, ordered by timestamp and then ID. It can include multiple samples for a case that revisits a milestone. For one cycle time per currently finished item, use the snapshot’s `cycleTime` readings.

For a cumulative flow diagram (CFD), take snapshots at regular points and stack `counts` with terminal bands at the bottom and earlier stages above later ones. Each entered item appears in one band at a time, including terminal outcomes. A widening band tells you where inventory is accumulating. Check arrivals, exits, changes in work mix, external waiting, and batching before you infer a constraint. Look at the oldest open items while you can still act on them. [ProKanban’s CFD guide](https://prokanban.org/blog/cumulative-flow-diagrams-cutting-through-the-colourful-clutter)

## Use distributions and variation

- `percentile(values, probability)` uses nearest rank. With an empty sample it returns `null`. Use completed times from a relevant period and comparable work to estimate a service level expectation (SLE). Show the sample size and boundaries. A percentile of prior observations can inform a forecast. Sparse or changing cohorts weaken it.
- `histogram(values, count = 6)` returns equal-width bins. Each bin includes its lower edge. The final bin also includes the maximum. When all values match, the first bin contains them.
- `individualsMovingRange(values, { baseline, minimumBaseline })` uses the first `baseline` observations to establish the center and limits. Supply observations in time order from a comparable process and freeze the baseline before checking for changes. By default the full supplied series is used and the minimum is two observations. An application can require a longer baseline before interpreting signals. The function reports points outside limits, runs of eight or more on one side of the center, and moving ranges above their limit. Use the signals to choose what to investigate. For guidance on using process behavior charts in flow reviews, see [ProKanban’s Visualizing Flow Metrics](https://prokanban.org/blog/visualizing-flow-metrics---where-to-begin).

Read flow metrics alongside the outcome the workflow serves. If more work finishes each week, check whether the people it serves are seeing better results.

## Further reading

- **Definitions and action on aging work.** Yuval Yeret describes WIP, throughput, cycle time, and work item age, then shows where they inform Scrum conversations. [Flow Metrics for Scrum](https://yuvalyeret.com/blog/4-key-flow-metrics-and-how-to-use-them-in-scrums-events/)
- **Portfolio decisions.** Apply the measures to a portfolio’s larger units of work and use aging to revisit what deserves capacity. [Improving Portfolio Flow Using Flow Metrics](https://yuvalyeret.com/blog/improving-portfolio-flow-using-flow-metrics/)
- **Comparing terminology.** Map related definitions when different teams use SAFe, Scrum, Kanban, or evidence-based management. [Mapping Flow Metrics Across SAFe, Scrum and Kanban](https://yuvalyeret.com/blog/mapping-flow-metrics-in-safe-professional-scrum-with-kanban-project-2-product-and-evidence-based-management/)
- **Start with friction.** Define the workflow and choose a measure that will help someone make a decision. [Teach your AI agents to help you Focus on Flow](https://yuvalyeret.com/blog/why-focus-on-flow-metrics/)
- **Agentic development.** Follow work through review and customer feedback when coding accelerates. [How to Leverage Flow Metrics To Accelerate Your Agentic Development Lifecycle](https://yuvalyeret.com/blog/flow-metrics-still-matter-agentic-ai-development/)
- **Workflow policy and the four measures.** Define where work starts and finishes, then use the four measures to manage flow. [Scrum.org’s Kanban Guide for Scrum Teams](https://www.scrum.org/resources/kanban-guide-scrum-teams), [ProKanban’s Basic Metrics of Flow](https://prokanban.org/blog/the-kanban-pocket-guide-chapter-6-the-basic-metrics-of-flow)
- **The origins of work item age.** Yuval traces the metric to the need to spot problems while there is still time to act on an open item. [Detecting Flow Issues Using Predictive Cycle Time Charts](https://www.scrum.org/resources/blog/detecting-flow-issues-using-predictive-cycle-time-charts-origin-kanbanflow-work-item-aging-metric)
