import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { countEventsInWindows, countIntervals, createBucketCounter, elapsed, percentile, percentiles } from '@yyeret/flow-metrics';

const cases = JSON.parse(readFileSync(new URL('./flow-calculation-cases.json', import.meta.url)));

test('shared elapsed and interval calculations preserve boundaries and empty ranges', () => {
  for (const { start, end, units, expected } of cases.elapsed) {
    assert.equal(elapsed(start, end, units), expected);
  }
  for (const { ranges, samples, expected } of cases.intervals) {
    assert.deepEqual(countIntervals(ranges, samples), expected);
  }
});

test('event buckets count events once using exclusive start and inclusive end', () => {
  for (const { events, bounds, expected } of cases.events) {
    assert.deepEqual(countEventsInWindows(events, bounds), expected);
  }
});

test('upper-index percentiles are opt-in and share conformance fixtures with Python', () => {
  for (const { values, probability, nearest, upper } of cases.percentiles) {
    assert.equal(percentile(values, probability), nearest);
    assert.equal(percentile(values, probability, { method: 'upper-index' }), upper);
  }
});

test('batch percentiles preserve requested order and handle empty samples', () => {
  const { values, probabilities, nearest, upper } = cases.batch;
  assert.deepEqual(percentiles(values, probabilities), nearest);
  assert.deepEqual(percentiles(values, probabilities, { method: 'upper-index' }), upper);
  assert.deepEqual(percentiles([], probabilities), [null, null, null]);
});

test('streamed bucket intervals clip to the sample range and exclude their end', () => {
  const counter = createBucketCounter(5);
  counter.add(-2, 2);
  counter.add(1, 5);
  counter.add(4, 8);
  counter.add(3, 3);
  counter.add(8, 10);
  assert.deepEqual(counter.counts(), [1, 2, 1, 1, 2]);
});
