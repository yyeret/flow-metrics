import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { countEventsInWindows, countIntervals, elapsed, percentile } from '@yyeret/flow-metrics';

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
