import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../examples/chart-data.mjs', import.meta.url));

test('the SLE example uses a frozen historical cohort and inclusive calendar days', () => {
  const model = JSON.parse(execFileSync(process.execPath, [script, 'sle'], { encoding: 'utf8' }));

  assert.equal(model.asOf, 111);
  assert.equal(model.finished.length, 175);
  assert.equal(model.active.length, 25);
  assert.deepEqual(model.reference, { from: 21, through: 90, size: 125, days: 17, isSle: true });
  assert.deepEqual(model.pace, {
    Build: [5, 7, 8, 8], Review: [7, 9, 10, 10], Validate: [14, 16, 17, 19],
  });
  const earlyAlert = model.active.find(item => item.id === 'item-179');
  assert.ok(earlyAlert.ageDays > model.pace.Build[2] && earlyAlert.ageDays < model.reference.days);
  assert.equal(model.weekly.reduce((sum, week) => sum + week.started - week.throughput, 0), 25);
  assert.equal(model.active.find(item => item.id === 'item-200').ageDays, 1);
  assert.equal(model.finished.every(item => item.cycleDays === item.cycleTime + 1), true);
  assert.deepEqual(
    model.active.filter(item => item.ageDays > model.reference.days)
      .map(({ stage, ageDays, stageDays }) => [stage, ageDays, stageDays]),
    [['Build', 21, 21], ['Review', 20, 13], ['Validate', 18, 9]],
  );
});
