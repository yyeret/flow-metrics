"""Render the chart data emitted by chart-data.mjs."""
import json
from pathlib import Path
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import MaxNLocator


data = json.load(sys.stdin)
daily = data["daily"]
days = [point["day"] for point in daily]
weekly = data["weekly"]
finished = data["finished"]
active = data["active"]
as_of = data["asOf"]
p85 = data["p85"]

ink = "#18283A"
muted = "#4C6276"
accent = "#315EA8"
reference = "#985326"
stage_colors = {
    "Build": "#74A4DC",
    "Review": "#B282BF",
    "Validate": "#E5B04B",
    "Done": "#288575",
}

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 11,
    "text.color": ink,
    "axes.labelcolor": muted,
    "axes.edgecolor": "#CBD4DF",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "xtick.color": muted,
    "ytick.color": muted,
    "grid.color": "#E1E7EE",
    "legend.frameon": False,
})

fig = plt.figure(figsize=(12, 12), layout="constrained", facecolor="#F5F8FB")
fig.get_layout_engine().set(h_pad=0.20, w_pad=0.24)
grid = fig.add_gridspec(3, 2, height_ratios=(1.18, 1, 1.12))
cfd = fig.add_subplot(grid[0, :])
wip = fig.add_subplot(grid[1, 0])
throughput = fig.add_subplot(grid[1, 1])
cycle = fig.add_subplot(grid[2, 0])
aging = fig.add_subplot(grid[2, 1])

fig.suptitle("Flow through a four-stage workflow", fontsize=23, fontweight="bold")
titles = [
    (cfd, "Cumulative flow diagram", "Items", "Day"),
    (wip, "Work in progress", "Active items", "Day"),
    (throughput, "Throughput run chart", "Items finished", "Seven-day period"),
    (cycle, "Cycle time scatterplot", "Elapsed days", "Finish day"),
    (aging, f"Aging work in progress · day {as_of}", "Elapsed days", "Current stage"),
]
for ax, title, y_label, x_label in titles:
    ax.set(xlabel=x_label, ylabel=y_label)
    ax.set_title(title, loc="left", fontweight="bold", pad=10)
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))

ticks = [0, 7, 14, 21, as_of]
for ax in (cfd, wip, cycle):
    ax.set_xlim(-0.5, as_of + 0.5)
    ax.set_xticks(ticks)

# Stack one band per stage, with the finish line anchored to the baseline.
bands = list(reversed(data["stages"]))
cfd.stackplot(days + [as_of + 1],
              *([point["counts"][stage] for point in daily + [daily[-1]]] for stage in bands),
              labels=bands, colors=[stage_colors[stage] for stage in bands], step="post")
cfd.set_ylim(0, len(finished) + len(active) + 3)
handles, labels = cfd.get_legend_handles_labels()
cfd.legend(handles[::-1], labels[::-1], loc="upper left", ncols=len(bands))

wip.step(days, [point["wip"] for point in daily], where="post", color=accent, linewidth=2.2)
wip.set_ylim(0, max(point["wip"] for point in daily) + 1)
wip.scatter(as_of, daily[-1]["wip"], color=accent, zorder=3)

period_labels = [f'{period["start"]}–{period["end"]}' for period in weekly]
period_counts = [period["throughput"] for period in weekly]
throughput.plot(period_labels, period_counts, color=accent, marker="o", linewidth=2, clip_on=False)
throughput.set_ylim(0, max(period_counts) + 1)

# Give the completed and active views the same duration scale.
duration_max = max([item["cycleTime"] for item in finished] +
                   [item["workItemAge"] for item in active])
for ax in (cycle, aging):
    ax.set_ylim(0, duration_max + 3)
    ax.axhline(p85, color=reference, linestyle="--", linewidth=1.4)
    ax.legend([ax.lines[-1]], [f"Sample P85 · {p85} days (n={len(finished)})"],
              loc="upper left", fontsize=10)

cycle.scatter([item["finishedAt"] for item in finished],
              [item["cycleTime"] for item in finished], color=accent,
              edgecolors="white", linewidths=0.8, s=65, zorder=3)

active_stages = data["activeStages"]
aging.set_xticks(range(len(active_stages)), active_stages)
aging.set_xlim(-0.4, len(active_stages) - 0.25)
for item in active:
    stage = item["stage"]
    point = (active_stages.index(stage), item["workItemAge"])
    aging.scatter(*point, color=stage_colors[stage], edgecolors=ink,
                  linewidths=0.7, s=53, zorder=3)
    aging.annotate(item["id"], point, xytext=(8, 0), textcoords="offset points",
                   va="center", fontsize=9)

fig.savefig(Path(__file__).with_name("flow-charts.png"), dpi=160)
