"""Render the chart data emitted by chart-data.mjs."""
from collections import Counter, defaultdict
import json
from math import ceil
from pathlib import Path
from statistics import mean, median, stdev
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.ticker import MaxNLocator


data = json.load(sys.stdin)
daily = data["daily"]
days = [point["day"] for point in daily]
weekly = data["weekly"]
finished = sorted(data["finished"], key=lambda item: (item["finishedAt"], item["id"]))
active = data["active"]
as_of = data["asOf"]
reference = data["reference"]

ink = "#18283A"
muted = "#4C6276"
accent = "#315EA8"
threshold_color = "#894631"
stage_colors = {
    "Build": "#74A4DC",
    "Review": "#B282BF",
    "Validate": "#E5B04B",
    "Done": "#288575",
}
pace_colors = ["#DAEFE3", "#F0F2CF", "#F9EBB5", "#F8DCC4", "#F5CFCD"]
pace_labels = ["≤50th", "50–70th", "70–85th", "85–95th", ">95th"]

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

fig = plt.figure(figsize=(12, 14.5), layout="constrained", facecolor="#F5F8FB")
fig.get_layout_engine().set(h_pad=0.20, w_pad=0.24)
grid = fig.add_gridspec(4, 2, height_ratios=(1, 0.84, 1.2, 1.2))
cfd = fig.add_subplot(grid[0, :])
wip = fig.add_subplot(grid[1, 0])
throughput = fig.add_subplot(grid[1, 1])
cycle = fig.add_subplot(grid[2, :])
aging = fig.add_subplot(grid[3, :])

fig.suptitle(f"Flow through a four-stage workflow · {len(finished) + len(active)} items",
             fontsize=21, fontweight="bold")
titles = [
    (cfd, "Cumulative flow diagram", "Items", "Day"),
    (wip, "Work in progress", "Active items", "Day"),
    (throughput, "Starts and finishes", "Items", "Seven-day period"),
    (cycle, "Flow time", "Calendar days", "Finish day"),
    (aging, f"Aging work in progress · day {as_of}", "Calendar days since start", "Current stage"),
]
for ax, title, y_label, x_label in titles:
    ax.set(xlabel=x_label, ylabel=y_label)
    ax.set_title(title, loc="left", fontweight="bold", pad=10)
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.yaxis.set_major_locator(MaxNLocator(integer=True, nbins=5))

tick_stride = 7 * ceil((as_of + 1) / 28)
ticks = [*range(0, as_of, tick_stride), as_of]
for ax in (cfd, wip, cycle):
    ax.set_xlim(-0.5, as_of + 0.5)
    ax.set_xticks(ticks)

# Stack one band per stage, with the finish line anchored to the baseline.
bands = list(reversed(data["stages"]))
cfd.stackplot(days + [as_of + 1],
              *([point["counts"][stage] for point in daily + [daily[-1]]] for stage in bands),
              labels=bands, colors=[stage_colors[stage] for stage in bands], step="post")
cfd.set_ylim(0, (len(finished) + len(active)) * 1.15)
handles, labels = cfd.get_legend_handles_labels()
cfd.legend(handles[::-1], labels[::-1], loc="upper left", ncols=len(bands))

wip.step(days, [point["wip"] for point in daily], where="post", color=accent, linewidth=2.2)
wip.set_ylim(0, max(point["wip"] for point in daily) + 1)
wip.scatter(as_of, daily[-1]["wip"], color=accent, zorder=3)

period_counts = [period["throughput"] for period in weekly]
period_starts = [period["started"] for period in weekly]
period_ticks = sorted({*range(0, len(weekly), ceil(len(weekly) / 5)), len(weekly) - 1})
period_labels = [f'{weekly[i]["start"]}–{weekly[i]["end"]}' for i in period_ticks]
throughput.plot(range(len(weekly)), period_counts, color=accent, marker="o",
                linewidth=2, clip_on=False, label="Finished")
throughput.plot(range(len(weekly)), period_starts, color="#687985", linestyle="--",
                marker="s", markersize=4, linewidth=1.5, label="Started")
throughput.set_xticks(period_ticks, period_labels)
throughput.set_ylim(0, max(max(period_counts), max(period_starts)) * 1.25 + 1)
throughput.legend(loc="upper left", ncols=2, fontsize=9)

# Center a work-item window on each completion, shortening it at the ends.
finish_days = [item["finishedAt"] for item in finished]
cycle_days = [item["cycleDays"] for item in finished]
half_window = max(2, int(len(finished) * 0.20) // 2)
rolling_mean = []
rolling_sd = []
for index in range(len(finished)):
    window = cycle_days[max(0, index - half_window):index + half_window + 1]
    rolling_mean.append(mean(window))
    rolling_sd.append(stdev(window))

lower = [max(0, center - sd) for center, sd in zip(rolling_mean, rolling_sd)]
upper = [center + sd for center, sd in zip(rolling_mean, rolling_sd)]
cycle.fill_between(finish_days, lower, upper, color="#DFEAF6", label="Rolling ±1 SD")
cycle.plot(finish_days, rolling_mean, color="#275780", linewidth=1.8,
           label=f"Rolling average ({2 * half_window + 1} items)")
cycle.axhline(mean(cycle_days), color="#B44C36", linewidth=1.6, label="Overall average")
completions = Counter(zip(finish_days, cycle_days))
cycle.scatter(*zip(*completions), s=[25 + 15 * (count - 1) for count in completions.values()],
              facecolors=["white" if count == 1 else "#B5CA74" for count in completions.values()],
              edgecolors="#688A22", linewidths=1.15, zorder=3,
              label="Completion (filled dots overlap)")
cycle.set_ylim(0, max(max(cycle_days), max(upper)) + 7)
cycle.legend(loc="upper right", ncols=2, fontsize=9)
cycle.text(0.012, 0.95, f"{len(finished)} finished   ·   Mean {mean(cycle_days):.1f}d"
           f"   ·   Median {median(cycle_days):g}d   ·   Range {min(cycle_days)}–{max(cycle_days)}d",
           transform=cycle.transAxes, va="top", fontsize=10)

active_stages = data["activeStages"]
pace = data["pace"]
age_top = max(max(item["ageDays"] for item in active),
              max(thresholds[-1] for thresholds in pace.values())) + 4
aging.set_xticks(range(len(active_stages)), active_stages)
aging.set_xlim(-0.5, len(active_stages) - 0.5)
aging.set_ylim(0, age_top)

# Each band describes cumulative age at which comparable work left this stage.
for index, stage in enumerate(active_stages):
    boundaries = [0, *pace[stage], age_top]
    for bottom, top, color in zip(boundaries, boundaries[1:], pace_colors):
        aging.fill_between([index - 0.5, index + 0.5], bottom, top, color=color,
                           linewidth=0, zorder=0)
    if index:
        aging.axvline(index - 0.5, color="white", linewidth=1.6, zorder=2)

reference_name = "85% SLE" if reference["isSle"] else "Sample P85"
threshold = reference["days"]
aging.axhline(threshold, color=threshold_color, linestyle="--", linewidth=1.4, zorder=2)
aging.annotate(f'{reference_name} · {threshold}d (n={reference["size"]})',
               (-0.46, threshold), xytext=(0, 4), textcoords="offset points",
               color=threshold_color, fontsize=9)

groups = defaultdict(list)
for item in active:
    groups[item["stage"], item["ageDays"]].append(item)

for (stage, age), items in groups.items():
    x = active_stages.index(stage)
    slow = age > pace[stage][2]
    color = "#983E36" if slow else ink
    aging.scatter(x, age, color=color, edgecolors="white", linewidths=0.8,
                  s=78 if len(items) > 1 else 48, zorder=3)
    if len(items) > 1:
        aging.text(x, age, str(len(items)), color="white", fontsize=7,
                   ha="center", va="center", zorder=4)
    elif slow or not reference["isSle"]:
        item = items[0]
        label = f'{item["id"]} · {item["stageDays"]}d in stage'
        aging.annotate(label, (x, age), xytext=(9, 0), textcoords="offset points",
                       va="center", color=color, fontsize=8.5)

aging.legend(handles=[Patch(facecolor=color, label=label)
                     for color, label in zip(pace_colors, pace_labels)],
             title="Historical age at stage exit", loc="upper center",
             bbox_to_anchor=(0.5, -0.20), ncols=5, fontsize=9, title_fontsize=9)

output = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("flow-charts.png")
fig.savefig(output, dpi=160)
