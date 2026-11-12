import json
import unittest
from datetime import datetime, timedelta
from pathlib import Path

from flow_metrics_core import count_events_in_windows, count_intervals, elapsed, percentile, percentiles


CASES = json.loads(Path(__file__).with_name("flow-calculation-cases.json").read_text(encoding="utf-8"))


class FlowCalculationTests(unittest.TestCase):
    def test_elapsed(self):
        for case in CASES["elapsed"]:
            self.assertEqual(elapsed(case["start"], case["end"], case["units"]), case["expected"])
        start = datetime(2026, 11, 12)
        self.assertEqual(elapsed(start, start + timedelta(hours=1, minutes=30), 3600), 1.5)

    def test_intervals(self):
        for case in CASES["intervals"]:
            self.assertEqual(count_intervals(case["ranges"], case["samples"]), case["expected"])

    def test_event_windows(self):
        for case in CASES["events"]:
            self.assertEqual(count_events_in_windows(case["events"], case["bounds"]), case["expected"])

    def test_percentiles(self):
        for case in CASES["percentiles"]:
            self.assertEqual(percentile(case["values"], case["probability"]), case["nearest"])
            self.assertEqual(percentile(case["values"], case["probability"], method="upper-index"), case["upper"])

    def test_batch_percentiles(self):
        case = CASES["batch"]
        self.assertEqual(percentiles(case["values"], case["probabilities"]), case["nearest"])
        self.assertEqual(percentiles(case["values"], case["probabilities"], method="upper-index"), case["upper"])
        self.assertEqual(percentiles([], case["probabilities"]), [None, None, None])
