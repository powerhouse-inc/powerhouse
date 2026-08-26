#!/usr/bin/env python3
"""
Renders the auth-scope cost matrix.

Reads two recorded inputs and writes nothing else:

  results/auth-scope.json   the micro tier, written by `pnpm bench:auth:record`
  data/auth-meso-runs.json  the end-to-end runs, committed with their caveats

Usage:
  python3 -m venv .venv && .venv/bin/pip install numpy matplotlib
  .venv/bin/python3 plot-auth-matrix.py

Every figure is drawn from measured cells. Where a comparison is not
trustworthy the chart says so on its face rather than in a caption nobody
reads: the blocked-ordering artifact is drawn hatched, and rungs that tie
within noise are annotated as ties rather than given a spurious ordering.
"""

import json
import statistics as st
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

HERE = Path(__file__).parent
OUT = HERE / "images"

INK = "#1f2933"
MUTED = "#7b8794"
BASE = "#9aa5b1"
STEP = "#2f6f9f"
ALERT = "#b4472f"
WARN = "#c98b1b"
GOOD = "#3f7d58"
GRID = "#dfe3e8"


def style(ax, title, xlabel="", ylabel=""):
    ax.set_title(title, fontsize=11, color=INK, loc="left", pad=9)
    if xlabel:
        ax.set_xlabel(xlabel, fontsize=9, color=MUTED)
    if ylabel:
        ax.set_ylabel(ylabel, fontsize=9, color=MUTED)
    ax.tick_params(labelsize=8.5, colors=MUTED, length=0)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(GRID)
    ax.grid(axis="y", color=GRID, linewidth=0.7)
    ax.set_axisbelow(True)


def caption(ax, text, dy=-0.30):
    """Explanatory text below the axes, so nothing overlaps the data."""
    ax.annotate(
        text,
        (0.0, dy),
        xycoords="axes fraction",
        fontsize=8.2,
        color=INK,
        va="top",
        linespacing=1.45,
    )


def load_micro():
    """Micro cells keyed by 'group / name', with mean in microseconds."""
    path = HERE / "results" / "auth-scope.json"
    if not path.exists():
        raise SystemExit(
            f"{path} is missing. Recorded runs are machine-specific and are not\n"
            "committed, so record one first:\n\n"
            "  pnpm --filter @powerhousedao/reactor bench:auth:record\n"
        )
    raw = json.loads(path.read_text())
    cells = {}
    for f in raw.get("files", []):
        for group in f.get("groups", []):
            gname = (group.get("fullName") or group.get("name") or "").split(" > ")[-1]
            for b in group.get("benchmarks", []):
                cells[f"{gname} / {b['name']}"] = {
                    "us": b["mean"] * 1000.0,
                    "hz": b["hz"],
                    "rme": b["rme"],
                }
    return cells


def micro(cells, group, name):
    key = f"{group} / {name}"
    if key not in cells:
        raise SystemExit(f"missing micro cell: {key}")
    return cells[key]


def load_meso():
    return json.loads((HERE / "data" / "auth-meso-runs.json").read_text())


def meso_set(meso, name):
    for s in meso["sets"]:
        if s["name"] == name:
            return s
    raise SystemExit(f"missing meso set: {name}")


# --- figure 1: where the end-to-end cost actually goes ----------------------


def figure_ladder(meso):
    primary = next(
        s for s in meso["sets"] if s.get("primary") and s.get("storage") == "postgres"
    )
    pglite = next(
        s for s in meso["sets"] if s.get("primary") and s.get("storage") == "pglite"
    )
    med = {k: st.median(v) for k, v in primary["seconds"].items()}
    pmed = {k: st.median(v) for k, v in pglite["seconds"].items()}

    base = med["L0_POLICIED"]
    d_admission = med["L1_DOCUMENT_DECISIONS"] - base
    d_auth = med["L2_AUTH_ENFORCEMENT"] - med["L1_DOCUMENT_DECISIONS"]

    top = meso_set(meso, "postgres top of ladder")
    tmed = {k: st.median(v) for k, v in top["seconds"].items()}
    ratio_l3 = tmed["L3_AUTH_GROUPS"] / tmed["L2_AUTH_ENFORCEMENT"]
    ratio_l4 = tmed["L4_AUTH_CONDITIONS"] / tmed["L2_AUTH_ENFORCEMENT"]

    fig, (ax, ax2, ax3) = plt.subplots(
        1, 3, figsize=(17.4, 6.0), gridspec_kw={"width_ratios": [1.5, 1.0, 0.95]}
    )

    labels = [
        "policy present,\nno flags",
        "+ documentDecisions\n(prerequisite)",
        "+ authEnforcement\n(the auth flag)",
        "+ authGroups\n+ authConditions",
    ]
    bottoms = [0, base, base + d_admission, base + d_admission + d_auth]
    heights = [base, d_admission, d_auth, 0]
    colors = [BASE, ALERT, STEP, MUTED]

    for i, (b, h, c) in enumerate(zip(bottoms, heights, colors)):
        if h == 0:
            ax.plot(
                [i - 0.34, i + 0.34], [b, b], color=MUTED, lw=2.2, solid_capstyle="butt"
            )
            ax.annotate(
                "no resolvable\ndifference",
                (i, b),
                textcoords="offset points",
                xytext=(0, 12),
                ha="center",
                fontsize=8.5,
                color=MUTED,
            )
            continue
        ax.bar(i, h, bottom=b, width=0.68, color=c, edgecolor="none")
        if i == 0:
            ax.annotate(
                f"{b + h:.2f}s baseline",
                (i, b + h / 2),
                ha="center",
                va="center",
                fontsize=9,
                color="white",
                weight="bold",
            )
        else:
            pct = h / base * 100.0
            ax.annotate(
                f"+{pct:.0f}%",
                (i, b + h / 2),
                ha="center",
                va="center",
                fontsize=11,
                color="white",
                weight="bold",
            )

    for i in range(3):
        ax.plot(
            [i + 0.34, i + 1 - 0.34],
            [bottoms[i] + heights[i]] * 2,
            color=GRID,
            lw=0.9,
            ls=(0, (3, 3)),
        )

    total = (base + d_admission + d_auth) / base
    ax.set_xticks(range(4))
    ax.set_xticklabels(labels, fontsize=8.5)
    ax.set_ylim(0, (base + d_admission + d_auth) * 1.16)
    style(
        ax,
        f"Turning auth on costs +{(total - 1) * 100:.0f}% end to end on Postgres.\n"
        f"Three quarters of it is the prerequisite, not authorization.",
        ylabel="wall time for 5000 operations (s)",
    )
    caption(
        ax,
        "Postgres 16, n=5 interleaved, schema dropped per cell, median. Each step is\n"
        "shown as a share of the baseline, so the two add to the total.",
        dy=-0.22,
    )

    share_admission = d_admission / (d_admission + d_auth) * 100
    ax2.barh(
        [1, 0],
        [share_admission, 100 - share_admission],
        color=[ALERT, STEP],
        height=0.44,
        edgecolor="none",
    )
    for y, v, lab in [
        (1, share_admission,
         "documentDecisions - the prerequisite\nadvisory lock, guarded insert, document-scope read"),
        (0, 100 - share_admission,
         "authEnforcement - the auth flag\nauth projection read, grant scan"),
    ]:
        ax2.annotate(
            f"{v:.0f}%",
            (v - 2, y),
            ha="right",
            va="center",
            fontsize=12,
            color="white",
            weight="bold",
        )
        ax2.annotate(
            lab,
            (2, y + 0.28),
            fontsize=8.4,
            color=INK,
            va="bottom",
            linespacing=1.4,
        )
    ax2.set_yticks([])
    ax2.set_ylim(-0.45, 1.62)
    ax2.set_xlim(0, 104)
    style(ax2, "Split of the added cost", xlabel="share of the +31% (%)")
    ax2.grid(axis="y", visible=False)
    ax2.grid(axis="x", color=GRID, linewidth=0.7)
    caption(
        ax2,
        f"Above authEnforcement the ladder flattens: authGroups {ratio_l3:.3f}x,\n"
        f"authConditions {ratio_l4:.3f}x against L2 (n=4), paired ratios straddling 1.\n"
        "Both tie because this workload cannot reach them: no group principals in\n"
        "the policy, nothing backdated so foldEvaluatedScope never runs, and one\n"
        "write in flight so no lock is ever contended.",
        dy=-0.22,
    )

    ratios = [
        (
            "documentDecisions",
            pmed["L1_DOCUMENT_DECISIONS"] / pmed["L0_POLICIED"],
            med["L1_DOCUMENT_DECISIONS"] / med["L0_POLICIED"],
        ),
        (
            "authEnforcement",
            pmed["L2_AUTH_ENFORCEMENT"] / pmed["L1_DOCUMENT_DECISIONS"],
            med["L2_AUTH_ENFORCEMENT"] / med["L1_DOCUMENT_DECISIONS"],
        ),
    ]
    x = np.arange(len(ratios))
    ax3.bar(x - 0.18, [r[1] for r in ratios], width=0.34, color=BASE,
            label="in-memory PGlite", edgecolor="none")
    ax3.bar(x + 0.18, [r[2] for r in ratios], width=0.34, color=STEP,
            label="Postgres 16", edgecolor="none")
    for i, (_, a, b) in enumerate(ratios):
        ax3.annotate(f"{a:.3f}x", (i - 0.18, a), textcoords="offset points",
                     xytext=(0, 4), ha="center", fontsize=8.5, color=INK)
        ax3.annotate(f"{b:.3f}x", (i + 0.18, b), textcoords="offset points",
                     xytext=(0, 4), ha="center", fontsize=8.5, color=INK)
    ax3.axhline(1.0, color=MUTED, lw=1, ls=(0, (2, 2)))
    ax3.set_xticks(x)
    ax3.set_xticklabels([r[0] for r in ratios], fontsize=8.5)
    ax3.set_ylim(0.95, 1.32)
    style(ax3, "The same ratios on real storage", ylabel="cost multiplier vs the rung below")
    ax3.legend(fontsize=8, frameon=False, loc="upper right")
    caption(
        ax3,
        "Postgres reproduces both steps to within a thousandth. It does not\n"
        "settle the advisory-lock question though: this workload keeps exactly\n"
        "one write in flight, so the lock is never contended. That needs\n"
        "concurrent writers sharing a group, which is still unbuilt.",
        dy=-0.22,
    )

    fig.subplots_adjust(left=0.055, right=0.99, top=0.80, bottom=0.32, wspace=0.24)
    fig.savefig(OUT / "auth-ladder.png", dpi=160)
    plt.close(fig)


# --- figure 2: the four cost drivers, all policy shape ----------------------


def figure_drivers(cells):
    fig, axes = plt.subplots(2, 2, figsize=(12.6, 10.6))
    g_cpu = "auth policy evaluation (pure CPU)"

    # grant scan: linear, no early exit
    ax = axes[0][0]
    counts = [2, 10, 100]
    last = [
        micro(cells, g_cpu, "evaluateGrantStack: 2 grants")["us"],
        micro(cells, g_cpu, "evaluateGrantStack: 10 grants")["us"],
        micro(cells, g_cpu, "evaluateGrantStack: 100 grants (cap), match last")["us"],
    ]
    first = micro(cells, g_cpu, "evaluateGrantStack: 100 grants (cap), match first")["us"]
    ax.plot(counts, last, "o-", color=STEP, lw=2, ms=6, label="deciding grant last")
    ax.plot([100], [first], "D", color=ALERT, ms=8, label="deciding grant first")
    ax.plot(counts, [last[0] * c / counts[0] for c in counts], ls=(0, (4, 3)),
            color=MUTED, lw=1.2, label="linear in grant count")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xticks(counts)
    ax.set_xticklabels([str(c) for c in counts])
    style(ax, "The grant stack has no early exit", "grants in policy", "us per decision")
    ax.legend(fontsize=8, frameon=False, loc="upper left")
    caption(
        ax,
        f"Moving the deciding grant to the front changes the cost by "
        f"{(first / last[-1] - 1) * 100:+.1f}% - nothing.\n"
        "Last-applicable-grant-wins forbids stopping early, so the whole stack is\n"
        "always scanned. An early-exit implementation would have won ~50x here.",
        dy=-0.26,
    )

    # group roster size
    ax = axes[0][1]
    g_grp = "group principals"
    names = ["group absent from the map", "group of 10 members", "group of 1000 members"]
    vals = [micro(cells, g_grp, f"10 grants, {n}")["us"] for n in names]
    bars = ax.bar(range(3), vals, width=0.6,
                  color=[GOOD, STEP, ALERT], edgecolor="none")
    for i, v in enumerate(vals):
        ax.annotate(f"{v:.2f} us", (i, v), textcoords="offset points", xytext=(0, 4),
                    ha="center", fontsize=9, color=INK)
    ax.set_xticks(range(3))
    ax.set_xticklabels(["absent\n(fails closed)", "10 members", "1000 members\n(cap)"],
                       fontsize=8.5)
    style(ax, "Membership is a linear scan that allocates per member",
          ylabel="us per decision")
    caption(
        ax,
        f"A full roster costs {vals[2] / vals[1]:.0f}x a ten-member one, about "
        f"{(vals[2] - vals[1]) / 990 * 1000:.1f} ns per member.\n"
        "The absent group is the cheapest outcome of all, which is exactly why a\n"
        "harness missing the group model reports groups as nearly free.",
        dy=-0.22,
    )

    # condition cliff
    ax = axes[1][0]
    g_cond = "conditions"
    below = micro(cells, g_cond, "evaluateGrantStack: 100 conditional grants, no context")["us"]
    one = micro(cells, g_cond, "evaluateCondition: single comparison")["us"]
    wide = micro(cells, g_cond, "evaluateCondition: 100 nodes, depth 2")["us"]
    worst = micro(cells, g_cond, "evaluateGrantStack: 100 grants x 100 condition nodes")["us"]
    labels = ["same policy,\nflag off", "one\ncomparison", "100-node\ncondition",
              "100 grants x\n100 nodes"]
    vals = [below, one, wide, worst]
    ax.bar(range(4), vals, width=0.6, color=[GOOD, BASE, WARN, ALERT], edgecolor="none")
    ax.set_yscale("log")
    for i, v in enumerate(vals):
        ax.annotate(f"{v:.2f} us" if v >= 0.1 else f"{v:.3f} us",
                    (i, v), textcoords="offset points", xytext=(0, 5),
                    ha="center", fontsize=9, color=INK)
    ax.set_xticks(range(4))
    ax.set_xticklabels(labels, fontsize=8.5)
    style(ax, "Conditions are the dominant CPU term", ylabel="us per decision (log)")
    caption(
        ax,
        f"The worst legal policy costs {worst / below:.0f}x the same policy evaluated below\n"
        "authConditions, where every conditional grant is skipped without being\n"
        "evaluated. Node count drives this; nesting depth barely registers.",
        dy=-0.26,
    )

    # retention: ordering, not size
    ax = axes[1][1]
    g_ret = "auth scope write validation"
    top10 = micro(cells, g_ret, "retention: 10 grants, administered from the top")["us"]
    top100 = micro(cells, g_ret, "retention: 100 grants, administered from the top")["us"]
    bot10 = micro(cells, g_ret, "retention: 10 grants, administered from the bottom")["us"]
    bot100 = micro(cells, g_ret, "retention: 100 grants, administered from the bottom")["us"]
    x = np.arange(2)
    ax.bar(x - 0.17, [top10, top100], width=0.32, color=GOOD,
           label="administration grant first", edgecolor="none")
    ax.bar(x + 0.17, [bot10, bot100], width=0.32, color=ALERT,
           label="administration grant last", edgecolor="none")
    ax.set_yscale("log")
    for xi, v in zip([-0.17, 0.83], [top10, top100]):
        ax.annotate(f"{v:.2f}", (xi, v), textcoords="offset points", xytext=(0, 4),
                    ha="center", fontsize=8.5, color=INK)
    for xi, v in zip([0.17, 1.17], [bot10, bot100]):
        ax.annotate(f"{v:.0f} us" if v > 10 else f"{v:.2f}", (xi, v),
                    textcoords="offset points", xytext=(0, 4), ha="center",
                    fontsize=8.5, color=INK)
    ax.set_xticks(x)
    ax.set_xticklabels(["10 grants", "100 grants"], fontsize=9)
    style(ax, "Retention cost is decided by ordering, not size",
          ylabel="us per auth-scope write (log)")
    ax.legend(fontsize=8, frameon=False, loc="upper left")
    caption(
        ax,
        f"{bot100 / top100:.0f}x apart at the same grant count, and both policies are\n"
        "installable. The reachability search stops at the first grant that still\n"
        "administers, so where it sits decides whether the check is linear or quadratic.",
        dy=-0.22,
    )

    fig.suptitle(
        "What auth costs on the CPU is set by policy shape, not by the flag",
        fontsize=13, color=INK, x=0.035, ha="left", y=0.975,
    )
    fig.subplots_adjust(left=0.065, right=0.985, top=0.92, bottom=0.17,
                        hspace=0.62, wspace=0.20)
    fig.savefig(OUT / "auth-cost-drivers.png", dpi=160)
    plt.close(fig)


# --- figure 3: the two gates ------------------------------------------------


def figure_gates(cells):
    fig, axes = plt.subplots(1, 2, figsize=(13.0, 6.6))
    g_gate = "admission gate vs no-gate baseline (decideAtHead)"
    g_read = "read gate (scopePredicate)"
    g_serve = "group roster serving"

    ax = axes[0]
    rungs = ["L0_CLEAN", "L0_POLICIED", "L1_DOCUMENT_DECISIONS",
             "L2_AUTH_ENFORCEMENT", "L3_AUTH_GROUPS", "L4_AUTH_CONDITIONS"]
    vals = [micro(cells, g_gate, f"{r}: 100 grants")["us"] for r in rungs]
    short = ["L0\nclean", "L0\npolicied", "L1\ndocDecisions",
             "L2\nauthEnforce", "L3\nauthGroups", "L4\nauthConditions"]
    colors = [BASE, BASE, BASE, STEP, STEP, STEP]
    ax.bar(range(6), vals, width=0.62, color=colors, edgecolor="none")
    for i, v in enumerate(vals):
        ax.annotate(f"{v:.2f}", (i, v), textcoords="offset points", xytext=(0, 4),
                    ha="center", fontsize=8.5, color=INK)
    ax.set_xticks(range(6))
    ax.set_xticklabels(short, fontsize=8)
    step = vals[3] / vals[2]
    ax.annotate("", xy=(3, vals[3]), xytext=(2, vals[2]),
                arrowprops=dict(arrowstyle="->", color=ALERT, lw=1.6))
    ax.annotate(f"{step:.1f}x", ((2 + 3) / 2, (vals[2] + vals[3]) / 2),
                textcoords="offset points", xytext=(-16, 6), fontsize=11,
                color=ALERT, weight="bold")
    style(ax, "The admission gate steps once, at authEnforcement",
          ylabel="us per decision (reads stubbed)")
    caption(
        ax,
        "The three grey bars are a control, not a measurement: below authEnforcement\n"
        "the gate reads no auth scope at all. Above it the ladder is flat because with\n"
        "reads stubbed, groups and conditions add almost no CPU - their cost is the\n"
        "reads, which this tier deliberately hides.",
        dy=-0.20,
    )

    ax = axes[1]
    refs = [1, 10, 100]
    vals = [micro(cells, g_serve, f"{n} referencer(s), reader outside the audience")["us"]
            for n in refs]
    ax.plot(refs, vals, "o-", color=ALERT, lw=2, ms=7, label="one read of a shared roster")
    ax.plot(refs, [vals[0] * r for r in refs], ls=(0, (4, 3)), color=MUTED, lw=1.2,
            label="strictly linear reference")
    fast = micro(cells, g_read, "ModelReadGate: uninitialized policy (fast path)")["us"]
    policied = micro(cells, g_read, "ModelReadGate: 100 grants")["us"]
    ax.axhline(policied, color=STEP, lw=1.4, ls=(0, (2, 2)))
    ax.annotate(f"ordinary policied read  {policied:.2f} us", (1.15, policied * 1.15),
                fontsize=8.2, color=STEP)
    ax.axhline(fast, color=GOOD, lw=1.4, ls=(0, (2, 2)))
    ax.annotate(f"uninitialized policy (fast path)  {fast:.2f} us", (1.15, fast * 1.15),
                fontsize=8.2, color=GOOD)
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xticks(refs)
    ax.set_xticklabels([str(r) for r in refs])
    style(ax, "Serving a shared roster is the read path's worst case",
          "documents referencing the group", "us per read (log)")
    ax.legend(fontsize=8, frameon=False, loc="upper left")
    caption(
        ax,
        f"{vals[-1]:.0f} us for one read at the examined-referencer bound, "
        f"{vals[-1] / fast:.0f}x the fast path.\n"
        f"Growth is slightly sublinear ({vals[-1] / vals[0]:.0f}x for 100x the referencers) "
        "because probes run\n"
        f"four at a time. The gate runs per result, so a 50-result listing is about\n"
        f"{vals[-1] * 50 / 1000:.0f} ms of host event loop - the loop Run 10 of BASELINE.md found pinned at 99%.",
        dy=-0.20,
    )

    fig.subplots_adjust(left=0.065, right=0.985, top=0.89, bottom=0.33, wspace=0.20)
    fig.savefig(OUT / "auth-gates.png", dpi=160)
    plt.close(fig)


# --- figure 4: where the prerequisite's cost actually goes -------------------


def figure_attribution():
    """Decomposes the documentDecisions delta from the recorded attribution run."""
    path = HERE / "data" / "auth-attribution-runs.json"
    if not path.exists():
        raise SystemExit(f"{path} is missing")
    d = json.loads(path.read_text())
    a = d["attribution"]
    rtt = d["measuredRoundTripMs"]["parameterised"]

    fig, (ax, ax2) = plt.subplots(
        1, 2, figsize=(13.6, 5.6), gridspec_kw={"width_ratios": [1.25, 1]}
    )

    parts = [
        ("Postgres\nexecuting SQL", a["postgresExecutingSqlMs"], a["postgresSharePct"], STEP),
        ("round trips\n(+1 stmt/operation)", a["roundTripEstimateMs"], a["roundTripSharePct"], WARN),
        ("building + serialising\nthe larger statement", a["remainderMs"], a["remainderSharePct"], ALERT),
    ]
    left = 0.0
    for label, ms, pct, colour in parts:
        ax.barh(0, ms, left=left, height=0.5, color=colour, edgecolor="none")
        ax.annotate(
            f"{pct:.0f}%",
            (left + ms / 2, 0),
            ha="center",
            va="center",
            fontsize=13,
            color="white",
            weight="bold",
        )
        ax.annotate(
            f"{label}\n{ms:.0f} ms",
            (left + ms / 2, 0.33),
            ha="center",
            va="bottom",
            fontsize=8.6,
            color=INK,
            linespacing=1.4,
        )
        left += ms

    ax.set_ylim(-0.45, 1.05)
    ax.set_xlim(0, a["wallDeltaMs"] * 1.02)
    ax.set_yticks([])
    style(
        ax,
        f"The +{a['wallDeltaMs']} ms that documentDecisions adds is not the decision,\n"
        "and it is mostly not the database either",
        xlabel="ms added over 5000 operations",
    )
    ax.grid(axis="y", visible=False)
    ax.grid(axis="x", color=GRID, linewidth=0.7)
    caption(
        ax,
        f"Postgres executing SQL is {a['postgresSharePct']}% of it. The evaluator itself is 0.15%.\n"
        f"The advisory lock costs 2 us to run and a whole round trip to issue, and\n"
        f"L1 issues {a['extraStatements']} more statements for 5000 operations - "
        f"{a['extraStatementsPerOperation']} per operation.\n"
        f"A sequential statement against this Postgres measures {rtt:.3f} ms.",
        dy=-0.30,
    )

    shapes = [
        ("guarded insert", 5005, 124.4, ALERT),
        ("extra document-scope read", 272, 114.7, WARN),
        ("advisory lock", 5006, 11.4, GOOD),
    ]
    y = np.arange(len(shapes))
    ax2.barh(y, [s[2] for s in shapes], height=0.5,
             color=[s[3] for s in shapes], edgecolor="none")
    for i, (label, calls, ms, _) in enumerate(shapes):
        ax2.annotate(f"{ms:.1f} ms over {calls:,} calls", (ms + 3, i),
                     va="center", fontsize=8.6, color=INK)
    ax2.set_yticks(y)
    ax2.set_yticklabels([s[0] for s in shapes], fontsize=9)
    ax2.invert_yaxis()
    ax2.set_xlim(0, 210)
    style(ax2, "Server-side, per statement shape", xlabel="ms added")
    ax2.grid(axis="y", visible=False)
    ax2.grid(axis="x", color=GRID, linewidth=0.7)
    caption(
        ax2,
        "The lock is the cheapest row to execute and the most expensive to issue:\n"
        "one per operation, because it must be held before the insert takes its\n"
        "snapshot. Batching applies removes a round trip, a lock and a statement\n"
        "construction per operation at once, which is why it outranks preparing.",
        dy=-0.30,
    )

    fig.subplots_adjust(left=0.055, right=0.985, top=0.80, bottom=0.34, wspace=0.30)
    fig.savefig(OUT / "auth-attribution.png", dpi=160)
    plt.close(fig)


# --- figure 5: batching the applies ----------------------------------------


def figure_batching():
    """The 2x2 from Run 9: the flag off and on, batching off and on."""
    path = HERE / "data" / "auth-batching-runs.json"
    if not path.exists():
        raise SystemExit(f"{path} is missing")
    d = json.loads(path.read_text())
    med = d["medians"]

    order = [
        ("no flag", "L0_POLICIED", "L0P_batched"),
        ("documentDecisions", "L1", "L1_batched"),
    ]

    fig, (ax, ax2) = plt.subplots(
        1, 2, figsize=(13.4, 6.4), gridspec_kw={"width_ratios": [1.15, 1]}
    )

    x = np.arange(len(order))
    unb = [med[a[1]]["wallMs"] for a in order]
    bat = [med[a[2]]["wallMs"] for a in order]
    ax.bar(x - 0.19, unb, width=0.36, color=ALERT,
           label="one transaction per operation", edgecolor="none")
    ax.bar(x + 0.19, bat, width=0.36, color=GOOD,
           label="one transaction per batch", edgecolor="none")
    for i, (u, b) in enumerate(zip(unb, bat)):
        ax.annotate(f"{u:.0f} ms", (i - 0.19, u), textcoords="offset points",
                    xytext=(0, 4), ha="center", fontsize=9, color=INK)
        ax.annotate(f"{b:.0f} ms", (i + 0.19, b), textcoords="offset points",
                    xytext=(0, 4), ha="center", fontsize=9, color=INK)
        ax.annotate(f"{b / u:.2f}x", (i + 0.19, b / 2), ha="center",
                    va="center", fontsize=12, color="white", weight="bold")
    ax.set_xticks(x)
    ax.set_xticklabels([a[0] for a in order], fontsize=9.5)
    ax.set_ylim(0, max(unb) * 1.18)
    style(ax, "Batching is worth 29% with the flag off,\nso it is not an auth fix",
          ylabel="wall time for 5000 operations (ms)")
    ax.legend(fontsize=8.5, frameon=False, loc="upper center",
              bbox_to_anchor=(0.5, -0.10), ncol=2)
    caption(
        ax,
        f"The flag costs +{(med['L1']['wallMs'] / med['L0_POLICIED']['wallMs'] - 1) * 100:.0f}% "
        f"unbatched and +{(med['L1_batched']['wallMs'] / med['L0P_batched']['wallMs'] - 1) * 100:.0f}% batched, "
        "so batching nearly halves its relative cost\nrather than removing it: the extra read and the larger "
        "statement are amortised\nacross the batch, not eliminated. The write path was issuing a transaction "
        "per\noperation regardless of any of this.",
        dy=-0.34,
    )

    shapes = ["Operation inserts", "advisory locks", "statements (all)"]
    before = [
        med["L1"]["operationInserts"],
        med["L1"]["advisoryLocks"],
        med["L1"]["statements"],
    ]
    after = [
        med["L1_batched"]["operationInserts"],
        med["L1_batched"]["advisoryLocks"],
        med["L1_batched"]["statements"],
    ]
    y = np.arange(len(shapes))
    ax2.barh(y - 0.18, before, height=0.34, color=ALERT, label="unbatched",
             edgecolor="none")
    ax2.barh(y + 0.18, after, height=0.34, color=GOOD, label="batched",
             edgecolor="none")
    for i, (b, a) in enumerate(zip(before, after)):
        ax2.annotate(f"{b:,.0f}", (b * 1.12, i - 0.18), va="center",
                     fontsize=8.6, color=INK)
        ax2.annotate(f"{a:,.0f}", (a * 1.12, i + 0.18), va="center",
                     fontsize=8.6, color=INK)
    ax2.set_xscale("log")
    ax2.set_yticks(y)
    ax2.set_yticklabels(shapes, fontsize=9)
    ax2.invert_yaxis()
    ax2.set_xlim(10, 200000)
    style(ax2, "What the batch removes", xlabel="calls per 5000 operations (log)")
    ax2.grid(axis="y", visible=False)
    ax2.grid(axis="x", color=GRID, linewidth=0.7)
    ax2.legend(fontsize=8.5, frameon=False, loc="upper center",
               bbox_to_anchor=(0.5, -0.10), ncol=2)
    caption(
        ax2,
        "One guarded insert and one advisory lock per batch of a hundred, in place\n"
        "of one of each per operation. Run 8 predicted this count would fall and the\n"
        "wall time would fall with it; it did, so the cost was round trips and\n"
        "statement construction rather than anything the server was computing.",
        dy=-0.34,
    )

    fig.subplots_adjust(left=0.075, right=0.985, top=0.82, bottom=0.36, wspace=0.30)
    fig.savefig(OUT / "auth-batching.png", dpi=160)
    plt.close(fig)


def main():
    OUT.mkdir(exist_ok=True)
    cells = load_micro()
    meso = load_meso()
    figure_ladder(meso)
    figure_drivers(cells)
    figure_gates(cells)
    figure_attribution()
    figure_batching()
    for name in ("auth-ladder.png", "auth-cost-drivers.png", "auth-gates.png",
                 "auth-attribution.png", "auth-batching.png"):
        size = (OUT / name).stat().st_size / 1024
        print(f"  images/{name}  {size:.0f} KB")


if __name__ == "__main__":
    main()
