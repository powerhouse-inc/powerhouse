#!/usr/bin/env python3
"""
Mathematical Model: Reshuffle Growth Dynamics

Models the positive feedback loop in the Powerhouse reactor sync system:
  push latency → stale timestamps → wider conflict window → larger reshuffle
  → more processing time → more latency → ...

Parameters derived from codebase:
  B = 25          (BufferedMailbox batch size, gql-req-channel.ts)
  T_flush = 500ms (BufferedMailbox flush timer)
  S_max = 1000    (maxSkipThreshold, simple-job-executor.ts)
  T_poll = 2000ms (poll interval, gql-req-channel.ts)
  RTT ≈ 50ms      (assumed network round-trip)
"""

import argparse
import json
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

# ─── Parameters ───────────────────────────────────────────────────────────────

B = 25              # batch size threshold
T_FLUSH = 0.5       # flush timer (seconds)
S_MAX = 1000        # max reshuffle threshold
T_POLL = 2.0        # poll interval (seconds)
RTT = 0.05          # network round-trip time (seconds)

# ─── Derived helpers ──────────────────────────────────────────────────────────

def t_batch(M):
    """Time between batch flushes for a single client at M ops/sec."""
    return min(B / M, T_FLUSH) if M > 0 else T_FLUSH


def b_eff(M):
    """Actual number of ops in a batch."""
    return min(B, M * T_FLUSH)


def x_crit(N, M):
    """
    Critical processing time per operation (ms).

    In steady state (no queue buildup), each of N clients sends a batch
    every T_batch seconds. The server must process all N batches within
    one T_batch window. Each batch contains B_eff ops plus C(age) conflicts.

    Stable when: X * (B_eff + N * M * age) < T_batch * 1000 / N
    """
    Tb = t_batch(M)
    Be = b_eff(M)
    age = Tb + RTT
    conflict_ops = N * M * age
    total_ops_per_batch = Be + conflict_ops
    if total_ops_per_batch <= 0:
        return float('inf')
    available_ms = Tb * 1000.0 / N
    return available_ms / total_ops_per_batch


# ─── Discrete-time simulation ────────────────────────────────────────────────

def simulate(N, M, X_ms, duration_sec=30.0, dt=0.01):
    """
    Simulate the queue/conflict dynamics over time.

    Returns dict with time series:
      t          - time points (seconds)
      queue      - server queue depth (batches waiting)
      conflicts  - conflict count for the batch being processed
      age        - effective age of the batch being processed
      failed     - whether S_MAX was exceeded
    """
    Tb = t_batch(M)
    Be = b_eff(M)

    steps = int(duration_sec / dt)
    t = np.zeros(steps)
    queue_depth = np.zeros(steps)
    conflict_count = np.zeros(steps)
    age_series = np.zeros(steps)

    # State
    queue = 0.0           # fractional batch queue (batches waiting)
    processing_remaining = 0.0  # ms remaining on current batch
    current_conflicts = 0
    current_age = 0.0
    failed = False
    fail_time = None

    # Each client sends a batch every Tb seconds → N/Tb batches/sec total
    batch_arrival_rate = N / Tb  # batches per second

    for i in range(steps):
        t[i] = i * dt

        # Arrivals this timestep
        arrivals = batch_arrival_rate * dt
        queue += arrivals

        # If server is idle and queue > 0, start processing next batch
        if processing_remaining <= 0 and queue >= 1.0:
            queue -= 1.0
            # Age = time in buffer + time in queue + RTT
            queue_wait = (queue / batch_arrival_rate) if batch_arrival_rate > 0 else 0
            current_age = Tb + queue_wait + RTT
            # Conflicts = all ops that arrived at server during this batch's age
            current_conflicts = N * M * current_age
            if current_conflicts > S_MAX:
                failed = True
                if fail_time is None:
                    fail_time = t[i]
            # Processing time for this batch
            processing_remaining = X_ms * (Be + current_conflicts)

        # Consume processing time
        if processing_remaining > 0:
            processing_remaining -= dt * 1000  # dt in seconds, processing in ms

        queue_depth[i] = queue
        conflict_count[i] = current_conflicts
        age_series[i] = current_age

    return {
        't': t,
        'queue': queue_depth,
        'conflicts': conflict_count,
        'age': age_series,
        'failed': failed,
        'fail_time': fail_time,
    }


# ─── Experimental data ────────────────────────────────────────────────────────

def load_experimental(path):
    """Load parsed experiment results from JSON."""
    if path and os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


def overlay_experimental(ax, experiments, annotate=True):
    """Overlay experimental data points on an (N, M) axis."""
    for e in experiments:
        N = e["clients"]
        M = e["M_approx"]
        stable = e["stable"]
        color = "#00ff00" if stable else "#ff0000"
        marker = "o" if stable else "X"
        edge = "black"
        ax.plot(N, M, marker, color=color, markersize=14,
                markeredgecolor=edge, markeredgewidth=1.5, zorder=10)
        if annotate:
            ttf = ""
            if not stable and e.get("first_reshuffle_ms") is not None:
                ttf = f"\n{e['first_reshuffle_ms']/1000:.0f}s"
            elif not stable and e.get("first_dead_letter_ms") is not None:
                ttf = f"\n{e['first_dead_letter_ms']/1000:.0f}s"
            label = f"{'OK' if stable else 'FAIL'}{ttf}"
            ax.annotate(label, (N, M), (N + 0.3, M + 1.5),
                        color='white', fontsize=8, fontweight='bold', zorder=11)


# ─── Plot 1: Stability heatmap in (N, M) space ──────────────────────────────

def plot_stability_heatmap(X_fixed=25.0, output="reshuffle_heatmap.png", experiments=None):
    """Heatmap: stable vs unstable regions for fixed X (ms/op)."""
    N_range = np.arange(1, 21)
    M_range = np.linspace(0.1, 20, 100)
    Ngrid, Mgrid = np.meshgrid(N_range, M_range)

    # Compute ratio: X_fixed / X_crit. > 1 means unstable
    ratio = np.zeros_like(Ngrid, dtype=float)
    for i in range(Ngrid.shape[0]):
        for j in range(Ngrid.shape[1]):
            xc = x_crit(Ngrid[i, j], Mgrid[i, j])
            ratio[i, j] = X_fixed / xc if xc > 0 else float('inf')

    # Custom colormap: green (stable) → yellow (boundary) → red (unstable)
    colors = ["#2ecc71", "#f1c40f", "#e74c3c", "#8b0000"]
    cmap = LinearSegmentedColormap.from_list("stability", colors)

    fig, ax = plt.subplots(figsize=(10, 7))
    im = ax.pcolormesh(Ngrid, Mgrid, ratio, cmap=cmap, vmin=0, vmax=3, shading='auto')
    ax.contour(Ngrid, Mgrid, ratio, levels=[1.0], colors='white', linewidths=2, linestyles='--')
    cbar = fig.colorbar(im, ax=ax, label="X / X_crit  (>1 = unstable)")
    ax.set_xlabel("Number of Clients (N)")
    ax.set_ylabel("Ops/sec per Client (M)")
    ax.set_title(f"Reshuffle Stability Map (X = {X_fixed} ms/op)\nWhite dashed = critical boundary")
    ax.set_xticks(N_range)

    # Overlay experimental data
    if experiments:
        overlay_experimental(ax, experiments)
        ax.set_title(f"Reshuffle Stability Map (X = {X_fixed} ms/op)\n"
                     f"White dashed = analytical boundary | Circles/Xs = experimental")

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 2: Time series near the boundary ──────────────────────────────────

def plot_time_series(output="reshuffle_timeseries.png"):
    """Conflict count over time for several (N, M) configs."""
    # X=10ms/op: each op involves DB reads, document model processing,
    # conflict detection, and index updates.
    configs = [
        (2, 5, 25.0, "N=2, M=5"),
        (3, 10, 25.0, "N=3, M=10"),
        (5, 10, 25.0, "N=5, M=10 (stress test)"),
        (10, 10, 25.0, "N=10, M=10"),
    ]

    fig, axes = plt.subplots(2, 1, figsize=(12, 8), sharex=True)

    for N, M, X, label in configs:
        result = simulate(N, M, X, duration_sec=30.0)
        xc = x_crit(N, M)
        ratio = X / xc if xc > 0 else float('inf')
        tag = f"{label}  [X/Xc={ratio:.2f}]"

        axes[0].plot(result['t'], result['conflicts'], label=tag, linewidth=1.5)
        axes[1].plot(result['t'], result['queue'], label=tag, linewidth=1.5)

    axes[0].axhline(y=S_MAX, color='red', linestyle=':', linewidth=1, alpha=0.7, label=f"S_max = {S_MAX}")
    axes[0].set_ylabel("Conflict Count (reshuffle size)")
    axes[0].set_title("Reshuffle Size Over Time")
    axes[0].legend(fontsize=8, loc='upper left')
    axes[0].set_yscale('symlog', linthresh=10)

    axes[1].set_ylabel("Queue Depth (batches)")
    axes[1].set_xlabel("Time (seconds)")
    axes[1].set_title("Server Queue Depth Over Time")
    axes[1].legend(fontsize=8, loc='upper left')
    axes[1].set_yscale('symlog', linthresh=1)

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 3: Critical X as a function of N ──────────────────────────────────

def plot_critical_x(output="reshuffle_critical_x.png"):
    """X_crit vs N for several values of M."""
    N_range = np.arange(1, 21)
    M_values = [2, 5, 10, 20, 50]

    fig, ax = plt.subplots(figsize=(10, 6))

    for M in M_values:
        xc = [x_crit(N, M) for N in N_range]
        ax.plot(N_range, xc, 'o-', label=f"M = {M} ops/sec", linewidth=2, markersize=4)

    ax.set_xlabel("Number of Clients (N)")
    ax.set_ylabel("Critical X (ms/op)")
    ax.set_title("Maximum Sustainable Processing Time per Operation\n(Above line = unstable, reshuffle explosion)")
    ax.set_yscale('log')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.set_xticks(N_range)

    # Annotate practical range
    ax.axhspan(0.1, 2.0, alpha=0.1, color='blue', label='Typical server range')
    ax.text(15, 0.3, "Typical server\nprocessing range", fontsize=9, color='blue', alpha=0.7)

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 4: Queue explosion detail ─────────────────────────────────────────

def plot_queue_explosion(output="reshuffle_queue_explosion.png"):
    """Detailed view of queue/conflict/age feedback loop for one config."""
    N, M, X = 5, 10, 25.0
    result = simulate(N, M, X, duration_sec=20.0, dt=0.005)

    fig, axes = plt.subplots(3, 1, figsize=(12, 9), sharex=True)

    # Queue
    axes[0].plot(result['t'], result['queue'], color='#3498db', linewidth=1.5)
    axes[0].set_ylabel("Queue Depth\n(batches)")
    axes[0].set_title(f"Feedback Loop Explosion (N={N}, M={M}, X={X} ms/op)\n"
                      f"X_crit = {x_crit(N, M):.3f} ms/op → X/X_crit = {X/x_crit(N, M):.1f}x over budget")

    # Age
    axes[1].plot(result['t'], result['age'], color='#e67e22', linewidth=1.5)
    axes[1].set_ylabel("Batch Age\n(seconds)")

    # Conflicts
    axes[2].plot(result['t'], result['conflicts'], color='#e74c3c', linewidth=1.5)
    axes[2].axhline(y=S_MAX, color='red', linestyle=':', linewidth=1, alpha=0.7)
    axes[2].text(0.5, S_MAX * 1.1, f"S_max = {S_MAX}", color='red', fontsize=9)
    axes[2].set_ylabel("Conflict Count")
    axes[2].set_xlabel("Time (seconds)")

    if result['fail_time'] is not None:
        for ax in axes:
            ax.axvline(x=result['fail_time'], color='red', linestyle='--', alpha=0.5)
        axes[0].text(result['fail_time'] + 0.3, axes[0].get_ylim()[1] * 0.8,
                     f"FAILURE at t={result['fail_time']:.1f}s", color='red', fontsize=10, fontweight='bold')

    for ax in axes:
        ax.grid(True, alpha=0.2)

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 5: Experimental results summary ────────────────────────────────────

def plot_experimental_summary(experiments, output="reshuffle_experimental.png"):
    """Bar chart: time-to-failure for each experiment config."""
    if not experiments:
        return

    labels = []
    ttf_values = []
    colors = []
    duration_sec = []

    for e in experiments:
        N = e["clients"]
        M = e["M_approx"]
        dur = e.get("duration", 30000) / 1000.0
        labels.append(f"N={N}\nM={M:.0f}")
        duration_sec.append(dur)

        if e["stable"]:
            ttf_values.append(dur)  # survived full duration
            colors.append("#2ecc71")
        else:
            # Time to first failure
            ttf = None
            if e.get("first_reshuffle_ms") is not None:
                ttf = e["first_reshuffle_ms"] / 1000.0
            elif e.get("first_dead_letter_ms") is not None:
                ttf = e["first_dead_letter_ms"] / 1000.0
            ttf_values.append(ttf if ttf else 0)
            colors.append("#e74c3c")

    fig, ax = plt.subplots(figsize=(10, 5))
    x = np.arange(len(labels))
    bars = ax.bar(x, ttf_values, color=colors, edgecolor='black', linewidth=0.5)

    # Show full duration line
    max_dur = max(duration_sec) if duration_sec else 30
    ax.axhline(y=max_dur, color='gray', linestyle=':', linewidth=1, alpha=0.5)
    ax.text(len(labels) - 0.5, max_dur + 0.5, f"test duration ({max_dur:.0f}s)",
            fontsize=8, color='gray', ha='right')

    # Annotate bars
    for i, (bar, e) in enumerate(zip(bars, experiments)):
        xc = x_crit(e["clients"], e["M_approx"])
        if e["stable"]:
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                    f"STABLE\nXc={xc:.1f}ms", ha='center', fontsize=8, color='#2ecc71',
                    fontweight='bold')
        else:
            reshuffles = e.get("reshuffle_count", 0)
            dead = e.get("dead_letter_count", 0)
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.5,
                    f"FAIL\nXc={xc:.1f}ms\n{reshuffles}R/{dead}DL",
                    ha='center', fontsize=7, color='#e74c3c', fontweight='bold')

    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.set_ylabel("Time to First Failure (seconds)")
    ax.set_title("Experimental Results: Stable vs Unstable Configurations\n"
                 "Green = survived full test | Red = reshuffle explosion")
    ax.set_ylim(0, max_dur * 1.3)

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Summary table ───────────────────────────────────────────────────────────

def print_summary():
    """Print analytical results for key configurations."""
    print("\n" + "=" * 70)
    print("RESHUFFLE GROWTH DYNAMICS - ANALYTICAL SUMMARY")
    print("=" * 70)
    print(f"\nParameters: B={B}, T_flush={T_FLUSH*1000:.0f}ms, "
          f"S_max={S_MAX}, RTT={RTT*1000:.0f}ms")
    print(f"\nStability condition: X < X_crit = (T_batch*1000/N) / (B_eff + N*M*age)")
    print(f"  where age = T_batch + RTT, T_batch = min(B/M, {T_FLUSH})")

    X_ref = 25.0  # experimentally derived: N=2,M=10 fails → X > 22ms/op
    print(f"\n{'N':>3} {'M':>6} {'T_batch':>8} {'B_eff':>6} {'age':>6} "
          f"{'conflicts':>10} {'X_crit':>8} {f'X={X_ref:.0f}ms?':>10}")
    print("-" * 70)

    for N in [1, 2, 3, 5, 8, 10, 15, 20]:
        for M in [2, 5, 10, 20]:
            Tb = t_batch(M)
            Be = b_eff(M)
            age = Tb + RTT
            conflicts = N * M * age
            xc = x_crit(N, M)
            stable = "STABLE" if X_ref < xc else "UNSTABLE"
            print(f"{N:>3} {M:>6} {Tb:>7.2f}s {Be:>6.1f} {age:>5.2f}s "
                  f"{conflicts:>10.1f} {xc:>7.3f}ms {stable:>10}")

    # Stress test analysis
    print(f"\n{'─' * 70}")
    print("STRESS TEST ANALYSIS (N=5, M=10 ops/sec)")
    N, M = 5, 10
    Tb = t_batch(M)
    xc = x_crit(N, M)
    print(f"  T_batch     = {Tb:.2f}s (batch interval per client)")
    print(f"  B_eff       = {b_eff(M):.0f} ops/batch")
    print(f"  age_min     = {Tb + RTT:.3f}s")
    print(f"  conflicts   = {N * M * (Tb + RTT):.0f} ops (at zero queue)")
    print(f"  X_crit      = {xc:.4f} ms/op")
    print(f"  → Server must process each op in < {xc:.2f}ms to stay stable")
    print(f"  → Stress test was failing, so actual X > {xc:.2f}ms/op")
    for X_est in [1.0, 10.0, 25.0]:
        ratio = X_est / xc
        status = "STABLE" if ratio < 1.0 else f"UNSTABLE ({ratio:.1f}x over)"
        print(f"  → At X={X_est:.0f}ms/op: {status}")


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import os

    parser = argparse.ArgumentParser(description="Reshuffle Growth Dynamics Model")
    parser.add_argument("--experimental", "-e", type=str, default=None,
                        help="Path to experiments.json from parse-experiments.py")
    args = parser.parse_args()

    # Output plots to the test-connect directory
    out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(out_dir)

    experiments = load_experimental(args.experimental)
    if experiments:
        print(f"Loaded {len(experiments)} experimental data points from {args.experimental}")
    else:
        # Check default location
        experiments = load_experimental("experiments.json")
        if experiments:
            print(f"Loaded {len(experiments)} experimental data points from experiments.json")

    print("Generating reshuffle dynamics model...")
    print_summary()

    print("\nGenerating plots...")
    plot_stability_heatmap(experiments=experiments)
    plot_time_series()
    plot_critical_x()
    plot_queue_explosion()

    if experiments:
        plot_experimental_summary(experiments)

    print("\nDone! Check the PNG files in:", out_dir)
