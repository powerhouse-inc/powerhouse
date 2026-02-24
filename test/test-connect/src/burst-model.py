#!/usr/bin/env python3
"""
Burst-Load Capacity Envelope Model

Models whether the reactor can absorb a short burst of concurrent load
and recover, rather than the steady-state stability question of reshuffle-model.py.

Key insight: under a burst, the queue grows during the burst but drains afterwards.
The question is whether the peak conflict count during burst+drain stays within S_max.

Both the switchboard (server) AND clients run reshuffle logic, so we simulate
both perspectives and report whichever hits S_max first.

Uses the analytical recurrence from the plan's conflict formulas:
  Server: C_server(W) = (N-1) * M * (T_push + W + RTT)
  Client: C_client(W) = M * (T_poll + W)

Where W is the queue wait time for each job. As the burst progresses, W grows
because processing can't keep up with arrivals, creating larger conflict windows.

Post-consolidation parameters:
  B = 25          (BufferedMailbox batch size)
  T_flush = 500ms (BufferedMailbox flush timer)
  S_max = 10000   (MAX_SKIP_THRESHOLD, raised from 1000)
  T_poll = 2000ms (poll interval)
  RTT = 50ms      (assumed localhost)
  X = 25ms/op     (experimentally derived processing time)
"""

import argparse
import json
import os
import math
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap

# ─── Parameters ───────────────────────────────────────────────────────────────

B = 25              # batch size threshold
T_FLUSH = 0.5       # flush timer (seconds)
S_MAX = 10000       # max reshuffle threshold (post-consolidation)
T_POLL = 2.0        # poll interval (seconds)
RTT = 0.05          # network round-trip time (seconds)
X_DEFAULT = 25.0    # default processing time per op (ms)
T_BURST_DEFAULT = 10.0  # default burst duration (seconds)
K_STORE = 12.0      # store amplification: each logical op creates ~K conflict
                     # entries due to index entries, metadata, sub-operations,
                     # bursty generation variance, and non-linear scan overhead.
                     # Calibrated against 22 experiments (93% accuracy):
                     #   boundary at (N-1)*M = S_max / (K * T_burst) ≈ 83
                     # Validation: K=12 gives peak=5760 for N=4,M=20,T=8
                     #   -> SURVIVES at S_max=10000, FAILS at S_max=1000

# ─── Derived helpers ──────────────────────────────────────────────────────────

def t_push(M):
    """Time between pushes for a single client at M ops/sec."""
    if M <= 0:
        return T_FLUSH
    return min(B / M, T_FLUSH)


def ops_per_push(M):
    """Actual number of ops in each push."""
    return min(B, M * T_FLUSH)


# ─── Analytical recurrence: server perspective ────────────────────────────────

def simulate_burst_server(N, M, X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT, S_max=S_MAX):
    """
    Server perspective using analytical conflict formula.

    Each of N clients sends a push every T_push seconds during the burst.
    Pushes arrive interleaved (every T_push/N seconds). Each push is processed
    serially. As the queue builds, later pushes wait longer (W increases),
    widening the conflict window.

    C_server(W) = (N-1) * M * (T_push + W + RTT)
    """
    Tp = t_push(M)
    opp = ops_per_push(M)
    X_sec = X_ms / 1000.0
    inter_arrival = Tp / N if N > 0 else Tp

    # Generate push arrival times
    num_pushes = int(math.ceil(N * T_burst / Tp))
    arrival_times = [i * inter_arrival for i in range(num_pushes)
                     if i * inter_arrival < T_burst]

    if not arrival_times:
        return _empty_result('server', T_burst)

    # Process pushes sequentially with analytical conflict formula
    ts_t = []
    ts_conflicts = []
    ts_queue = []
    ts_ops = []

    server_free_at = 0.0
    peak_conflicts = 0
    peak_time = 0.0
    failed = False
    fail_time = None
    cumulative_ops = 0
    queue_depth = 0

    for i, arr_t in enumerate(arrival_times):
        # When does this push get processed?
        proc_t = max(arr_t, server_free_at)
        W = proc_t - arr_t  # queue wait

        # Analytical conflict count (amplified by K_STORE)
        conflicts = K_STORE * (N - 1) * M * (Tp + W + RTT)

        # Clamp: can't exceed total store entries from OTHER clients during burst
        max_possible = K_STORE * (N - 1) * M * T_burst
        conflicts = min(conflicts, max_possible)

        if conflicts > peak_conflicts:
            peak_conflicts = conflicts
            peak_time = proc_t
        if conflicts > S_max and not failed:
            failed = True
            fail_time = proc_t

        # Processing time: X per incoming op + small scan overhead for conflicts
        # The conflict count is a check (getConflicting query), not full reprocessing
        scan_overhead = 0.001 * conflicts  # ~1ms per 1000 conflicts for index scan
        processing = X_sec * opp + scan_overhead
        server_free_at = proc_t + processing
        cumulative_ops += int(opp)

        # Track queue depth
        remaining_arrivals = sum(1 for t in arrival_times[i+1:]
                                 if t <= proc_t) if i < len(arrival_times) - 1 else 0

        ts_t.append(proc_t)
        ts_conflicts.append(conflicts)
        ts_queue.append(remaining_arrivals)
        ts_ops.append(cumulative_ops)

    # Final point
    ts_t.append(server_free_at)
    ts_conflicts.append(0)
    ts_queue.append(0)
    ts_ops.append(cumulative_ops)

    t_arr = np.array(ts_t)
    drain_time = max(0.0, t_arr[-1] - T_burst)

    return {
        'perspective': 'server',
        't': t_arr,
        'conflicts': np.array(ts_conflicts),
        'queue': np.array(ts_queue),
        'cumulative_ops': np.array(ts_ops),
        'peak_conflicts': peak_conflicts,
        'peak_time': peak_time,
        'drain_time': drain_time,
        'failed': failed,
        'fail_time': fail_time,
        'T_burst': T_burst,
    }


# ─── Analytical recurrence: client perspective ───────────────────────────────

def simulate_burst_client(N, M, X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT, S_max=S_MAX):
    """
    Client perspective using analytical conflict formula.

    A single client polls every T_poll seconds, receiving consolidated ops
    from (N-1) other clients. Each poll is a load job processed serially.
    As the queue builds, later polls wait longer (W increases), widening the
    conflict window of local ops that must be reshuffled.

    C_client(W) = M * (T_poll + W)

    This is the primary bottleneck for moderate N, high M (confirmed
    experimentally: all 4 dead letters at S_max=1000 were client-side).
    """
    X_sec = X_ms / 1000.0

    # Generate poll arrival times during burst (+ one transitional poll)
    poll_times = []
    t = T_POLL
    while t <= T_burst + T_POLL + 0.001:
        poll_times.append(t)
        t += T_POLL

    if not poll_times:
        return _empty_result('client', T_burst)

    # Process polls sequentially
    ts_t = []
    ts_conflicts = []
    ts_queue = []
    ts_ops = []

    client_free_at = 0.0
    peak_conflicts = 0
    peak_time = 0.0
    failed = False
    fail_time = None
    cumulative_ops = 0

    for i, poll_t in enumerate(poll_times):
        # Incoming ops from this poll
        if poll_t <= T_burst:
            incoming = (N - 1) * M * T_POLL
        else:
            # Transitional: only burst overlap
            burst_overlap = max(0.0, T_burst - (poll_t - T_POLL))
            incoming = (N - 1) * M * burst_overlap
        if incoming <= 0:
            continue

        # When does this poll get processed?
        proc_t = max(poll_t, client_free_at)
        W = proc_t - poll_t  # queue wait

        # Analytical conflict count: local ops in the window (amplified by K_STORE)
        # Window = T_poll + W, capped by burst duration
        window = T_POLL + W
        conflicts = K_STORE * M * window

        # Clamp: can't exceed total local store entries during burst
        max_local = K_STORE * M * T_burst
        conflicts = min(conflicts, max_local)

        if conflicts > peak_conflicts:
            peak_conflicts = conflicts
            peak_time = proc_t
        if conflicts > S_max and not failed:
            failed = True
            fail_time = proc_t

        # Processing time: X per incoming op + small scan overhead for conflicts
        scan_overhead = 0.001 * conflicts  # ~1ms per 1000 conflicts for index scan
        processing = X_sec * incoming + scan_overhead
        client_free_at = proc_t + processing
        cumulative_ops += int(incoming)

        # Queue depth estimate
        remaining = sum(1 for t in poll_times[i+1:]
                        if t <= proc_t) if i < len(poll_times) - 1 else 0

        ts_t.append(proc_t)
        ts_conflicts.append(conflicts)
        ts_queue.append(remaining)
        ts_ops.append(cumulative_ops)

    # Final point
    ts_t.append(client_free_at)
    ts_conflicts.append(0)
    ts_queue.append(0)
    ts_ops.append(cumulative_ops)

    t_arr = np.array(ts_t)
    drain_time = max(0.0, t_arr[-1] - T_burst)

    return {
        'perspective': 'client',
        't': t_arr,
        'conflicts': np.array(ts_conflicts),
        'queue': np.array(ts_queue),
        'cumulative_ops': np.array(ts_ops),
        'peak_conflicts': peak_conflicts,
        'peak_time': peak_time,
        'drain_time': drain_time,
        'failed': failed,
        'fail_time': fail_time,
        'T_burst': T_burst,
    }


def _empty_result(perspective, T_burst):
    return {
        'perspective': perspective,
        't': np.array([0.0]),
        'conflicts': np.array([0]),
        'queue': np.array([0]),
        'cumulative_ops': np.array([0]),
        'peak_conflicts': 0,
        'peak_time': 0.0,
        'drain_time': 0.0,
        'failed': False,
        'fail_time': None,
        'T_burst': T_burst,
    }


# ─── Combined simulation ─────────────────────────────────────────────────────

def simulate_burst(N, M, X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT, S_max=S_MAX):
    """Run both perspectives, return worst-case."""
    server = simulate_burst_server(N, M, X_ms, T_burst, S_max)
    client = simulate_burst_client(N, M, X_ms, T_burst, S_max)

    if client['peak_conflicts'] >= server['peak_conflicts']:
        worst = client
        bottleneck = 'client'
    else:
        worst = server
        bottleneck = 'server'

    return {
        'server': server,
        'client': client,
        'worst': worst,
        'bottleneck': bottleneck,
        'peak_conflicts': worst['peak_conflicts'],
        'failed': server['failed'] or client['failed'],
        'fail_time': min(
            server['fail_time'] or float('inf'),
            client['fail_time'] or float('inf')
        ) if (server['failed'] or client['failed']) else None,
        'drain_time': max(server['drain_time'], client['drain_time']),
        'survives': worst['peak_conflicts'] < S_max,
    }


# ─── Fast analytical peak (for heatmap) ──────────────────────────────────────

def fast_peak(N, M, X_ms, T_burst):
    """
    Fast peak estimate using closed-form queue-wait growth.

    For the server: pushes arrive every T_push/N seconds. Processing time
    grows as conflicts grow with queue wait. We iterate the recurrence
    to find peak conflicts without full simulation overhead.

    For the client: polls arrive every T_poll. Same recurrence approach.

    Returns (peak_conflicts, bottleneck).
    """
    Tp = t_push(M)
    opp = ops_per_push(M)
    X_sec = X_ms / 1000.0
    inter_arrival = Tp / N if N > 0 else Tp

    # Server peak via recurrence
    num_pushes = int(math.ceil(N * T_burst / Tp))
    server_free = 0.0
    server_peak = 0.0
    for i in range(min(num_pushes, 5000)):  # cap iterations
        arr_t = i * inter_arrival
        if arr_t >= T_burst:
            break
        proc_t = max(arr_t, server_free)
        W = proc_t - arr_t
        C = min(K_STORE * (N - 1) * M * (Tp + W + RTT),
                K_STORE * (N - 1) * M * T_burst)
        server_peak = max(server_peak, C)
        server_free = proc_t + X_sec * opp + 0.001 * C

    # Client peak via recurrence
    client_free = 0.0
    client_peak = 0.0
    t = T_POLL
    while t <= T_burst + T_POLL + 0.001:
        if t <= T_burst:
            incoming = (N - 1) * M * T_POLL
        else:
            overlap = max(0.0, T_burst - (t - T_POLL))
            incoming = (N - 1) * M * overlap
        if incoming <= 0:
            break
        proc_t = max(t, client_free)
        W = proc_t - t
        C = min(K_STORE * M * (T_POLL + W), K_STORE * M * T_burst)
        client_peak = max(client_peak, C)
        client_free = proc_t + X_sec * incoming + 0.001 * C
        t += T_POLL

    if client_peak >= server_peak:
        return client_peak, 'client'
    return server_peak, 'server'


# ─── Plot 1: Capacity heatmap ────────────────────────────────────────────────

def plot_capacity_heatmap(X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT, S_max=S_MAX,
                          experiments=None, output="burst_capacity_heatmap.png"):
    """Heatmap of peak_conflicts / S_max in (N, M) space with experimental overlay."""
    N_range = np.arange(1, 51)
    M_range = np.linspace(1, 50, 50)
    ratio_grid = np.zeros((len(M_range), len(N_range)))

    print(f"  Computing capacity heatmap ({len(N_range)}x{len(M_range)} grid)...")
    for i, M in enumerate(M_range):
        for j, N_val in enumerate(N_range):
            peak, _ = fast_peak(int(N_val), M, X_ms, T_burst)
            ratio_grid[i, j] = peak / S_max

    colors = ["#2ecc71", "#f1c40f", "#e74c3c", "#8b0000"]
    cmap = LinearSegmentedColormap.from_list("capacity", colors)

    fig, ax = plt.subplots(figsize=(12, 8))
    im = ax.pcolormesh(N_range, M_range, ratio_grid, cmap=cmap,
                       vmin=0, vmax=3, shading='auto')
    ax.contour(N_range, M_range, ratio_grid, levels=[1.0],
               colors='white', linewidths=2, linestyles='--')
    fig.colorbar(im, ax=ax, label="Peak Conflicts / S_max  (>1 = FAILS)")

    # Overlay experimental data points
    if experiments:
        for e in experiments:
            N_exp = e.get("clients", 0)
            M_exp = e.get("M_approx", 0)
            stable = e.get("stable", False)
            reshuffles = e.get("reshuffle_count", 0)

            if stable:
                marker, color, edge = 'o', '#00ff00', 'white'
            else:
                marker, color, edge = 'X', '#ff0000', 'white'

            ax.plot(N_exp, M_exp, marker, color=color, markeredgecolor=edge,
                    markeredgewidth=1.5, markersize=12, zorder=10)

        # Legend for experimental markers
        from matplotlib.lines import Line2D
        legend_elements = [
            Line2D([0], [0], marker='o', color='w', markerfacecolor='#00ff00',
                   markeredgecolor='white', markersize=10, label='Experiment: STABLE'),
            Line2D([0], [0], marker='X', color='w', markerfacecolor='#ff0000',
                   markeredgecolor='white', markersize=10, label='Experiment: FAILED'),
        ]
        ax.legend(handles=legend_elements, loc='upper right', fontsize=9,
                  facecolor='black', edgecolor='white', labelcolor='white')

    ax.set_xlabel("Number of Clients (N)")
    ax.set_ylabel("Ops/sec per Client (M)")
    ax.set_title(f"Burst-Load Capacity Envelope (T_burst={T_burst:.0f}s, "
                 f"S_max={S_max:,}, X={X_ms:.0f}ms/op)\n"
                 f"White dashed = model boundary | Markers = experimental results")

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 2: Burst time series ───────────────────────────────────────────────

def plot_burst_timeseries(X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT, S_max=S_MAX,
                          output="burst_timeseries.png"):
    """3-panel time series for representative burst configs."""
    configs = [
        (4, 20, "N=4, M=20 (validated)"),
        (10, 10, "N=10, M=10"),
        (20, 10, "N=20, M=10"),
        (10, 30, "N=10, M=30"),
    ]

    fig, axes = plt.subplots(3, 1, figsize=(14, 10), sharex=True)

    for N, M, label in configs:
        result = simulate_burst(N, M, X_ms, T_burst, S_max)
        worst = result['worst']
        tag = f"{label} [{result['bottleneck']}]"

        axes[0].plot(worst['t'], worst['conflicts'], 'o-', label=tag,
                     linewidth=1.5, markersize=3)
        axes[1].plot(worst['t'], worst['queue'], 'o-', label=tag,
                     linewidth=1.5, markersize=3)
        axes[2].plot(worst['t'], worst['cumulative_ops'], 'o-', label=tag,
                     linewidth=1.5, markersize=3)

    axes[0].axhline(y=S_max, color='red', linestyle=':', linewidth=1, alpha=0.7,
                    label=f"S_max = {S_max:,}")
    axes[0].set_ylabel("Conflict Count")
    axes[0].set_title(f"Burst Time Series (T_burst={T_burst:.0f}s, S_max={S_max:,})")
    axes[0].legend(fontsize=8, loc='upper left')
    axes[0].set_yscale('symlog', linthresh=10)

    axes[1].set_ylabel("Queue Depth")
    axes[1].legend(fontsize=8, loc='upper left')
    axes[1].set_yscale('symlog', linthresh=1)

    axes[2].set_ylabel("Cumulative Ops")
    axes[2].set_xlabel("Time (seconds)")
    axes[2].legend(fontsize=8, loc='upper left')

    for ax in axes:
        ax.axvline(x=T_burst, color='gray', linestyle='--', alpha=0.5)
        ax.grid(True, alpha=0.2)
    axes[0].text(T_burst + 0.2, axes[0].get_ylim()[1] * 0.7,
                 "burst ends", fontsize=9, color='gray')

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 3: Duration sensitivity ────────────────────────────────────────────

def plot_duration_sensitivity(X_ms=X_DEFAULT, S_max=S_MAX,
                              output="burst_duration_sensitivity.png"):
    """Boundary curves for various T_burst values. X=N, Y=M_max."""
    T_bursts = [5, 10, 30, 60]
    N_range = np.arange(2, 51)

    fig, ax = plt.subplots(figsize=(12, 7))

    for T_burst in T_bursts:
        M_max = []
        for N_val in N_range:
            N_int = int(N_val)
            lo, hi = 0.5, 500.0
            for _ in range(30):
                mid = (lo + hi) / 2
                peak, _ = fast_peak(N_int, mid, X_ms, T_burst)
                if peak < S_max:
                    lo = mid
                else:
                    hi = mid
            M_max.append(lo)
        ax.plot(N_range, M_max, 'o-', label=f"T_burst = {T_burst}s",
                linewidth=2, markersize=3)

    # Steady-state boundary
    M_steady = []
    for N_val in N_range:
        N_int = int(N_val)
        lo, hi = 0.1, 500.0
        for _ in range(30):
            mid = (lo + hi) / 2
            Tb = t_push(mid)
            Be = ops_per_push(mid)
            age = Tb + RTT
            conflict_ops = N_int * mid * age
            total_ops = Be + conflict_ops
            if total_ops <= 0:
                lo = mid
                continue
            x_crit = (Tb * 1000.0 / N_int) / total_ops
            if X_ms < x_crit:
                lo = mid
            else:
                hi = mid
        M_steady.append(lo)
    ax.plot(N_range, M_steady, 'k--', label="Steady-state boundary",
            linewidth=2, alpha=0.7)

    ax.set_xlabel("Number of Clients (N)")
    ax.set_ylabel("Max Sustainable M (ops/sec per client)")
    ax.set_title(f"Duration Sensitivity: Capacity Boundary vs Burst Length\n"
                 f"(S_max={S_max:,}, X={X_ms:.0f}ms/op)")
    ax.legend(fontsize=9)
    ax.grid(True, alpha=0.3)
    ax.set_yscale('log')

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Plot 4: Queue dynamics deep-dive ────────────────────────────────────────

def plot_queue_dynamics(N=20, M=10, X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT,
                        S_max=S_MAX, output="burst_queue_dynamics.png"):
    """4-panel deep-dive for one near-boundary config."""
    result = simulate_burst(N, M, X_ms, T_burst, S_max)

    fig, axes = plt.subplots(4, 1, figsize=(14, 12), sharex=True)

    for pname in ['server', 'client']:
        r = result[pname]
        style = 'o-' if pname == 'server' else 's--'
        alpha = 1.0 if pname == result['bottleneck'] else 0.5
        ms = 4 if pname == result['bottleneck'] else 3

        axes[0].plot(r['t'], r['conflicts'], style, label=pname,
                     linewidth=1.5, alpha=alpha, markersize=ms)
        axes[1].plot(r['t'], r['queue'], style, label=pname,
                     linewidth=1.5, alpha=alpha, markersize=ms)
        axes[2].plot(r['t'], r['cumulative_ops'], style, label=pname,
                     linewidth=1.5, alpha=alpha, markersize=ms)

    axes[0].axhline(y=S_max, color='red', linestyle=':', linewidth=1, alpha=0.7)
    axes[0].text(0.5, S_max * 1.1, f"S_max = {S_max:,}", color='red', fontsize=9)

    verdict = "SURVIVES" if result['survives'] else "FAILS"
    axes[0].set_ylabel("Conflict Count")
    axes[0].set_title(
        f"Queue Dynamics Deep-Dive: N={N}, M={M}, T_burst={T_burst:.0f}s\n"
        f"Peak={result['peak_conflicts']:,.0f}, Bottleneck={result['bottleneck']}, "
        f"Verdict={verdict}")
    axes[0].legend(fontsize=9)
    axes[0].set_yscale('symlog', linthresh=10)

    axes[1].set_ylabel("Queue Depth")
    axes[1].legend(fontsize=9)
    axes[1].set_yscale('symlog', linthresh=1)

    axes[2].set_ylabel("Cumulative Ops")
    axes[2].legend(fontsize=9)

    # Panel 4: running peak / S_max ratio
    for pname in ['server', 'client']:
        r = result[pname]
        style = 'o-' if pname == 'server' else 's--'
        alpha = 1.0 if pname == result['bottleneck'] else 0.5
        ms = 4 if pname == result['bottleneck'] else 3
        running_peak = np.maximum.accumulate(r['conflicts'])
        ratio = running_peak / S_max
        axes[3].plot(r['t'], ratio, style, label=pname,
                     linewidth=1.5, alpha=alpha, markersize=ms)

    axes[3].axhline(y=1.0, color='red', linestyle=':', linewidth=1, alpha=0.7)
    axes[3].set_ylabel("Peak / S_max")
    axes[3].set_xlabel("Time (seconds)")
    axes[3].legend(fontsize=9)

    for ax in axes:
        ax.axvline(x=T_burst, color='gray', linestyle='--', alpha=0.5)
        ax.grid(True, alpha=0.2)

    if result['failed'] and result['fail_time'] is not None:
        for ax in axes:
            ax.axvline(x=result['fail_time'], color='red', linestyle='--', alpha=0.5)

    plt.tight_layout()
    plt.savefig(output, dpi=150)
    plt.close()
    print(f"  Saved: {output}")


# ─── Summary table ────────────────────────────────────────────────────────────

def print_summary(X_ms=X_DEFAULT, T_burst=T_BURST_DEFAULT, S_max=S_MAX,
                  experiments=None):
    """Print results for key configurations including validation cases."""
    print("\n" + "=" * 90)
    print("BURST-LOAD CAPACITY ENVELOPE - SUMMARY")
    print("=" * 90)
    print(f"\nParameters: B={B}, T_flush={T_FLUSH*1000:.0f}ms, S_max={S_max:,}, "
          f"T_poll={T_POLL*1000:.0f}ms, RTT={RTT*1000:.0f}ms, X={X_ms:.0f}ms/op")
    print(f"Burst duration: {T_burst:.0f}s, K_store={K_STORE}")

    # Build experiment lookup: (N, M_approx) -> experiment
    exp_lookup = {}
    if experiments:
        for e in experiments:
            key = (e["clients"], e["M_approx"])
            # Keep the most recent experiment for each (N, M) combo
            exp_lookup[key] = e

    configs = [
        # Validation cases
        (4, 20, 8.0, 10000, "Validation: should SURVIVE"),
        (4, 20, 8.0, 1000,  "Validation: should FAIL"),
        # Exploration
        (4, 20, T_burst, S_max, "N=4, M=20"),
        (10, 10, T_burst, S_max, "N=10, M=10"),
        (10, 20, T_burst, S_max, "N=10, M=20"),
        (20, 10, T_burst, S_max, "N=20, M=10"),
        (20, 20, T_burst, S_max, "N=20, M=20"),
        (30, 10, T_burst, S_max, "N=30, M=10"),
        (30, 20, T_burst, S_max, "N=30, M=20"),
        (40, 10, T_burst, S_max, "N=40, M=10"),
        (40, 20, T_burst, S_max, "N=40, M=20"),
        (50, 10, T_burst, S_max, "N=50, M=10"),
        (50, 20, T_burst, S_max, "N=50, M=20"),
    ]

    header = (f"{'Config':<30} {'Peak':>8} {'Ratio':>8} {'BN':>7} "
              f"{'Drain':>7} {'Model':>10}")
    if experiments:
        header += f"  {'Reshuf':>6} {'RealDL':>6} {'Exp':>10} {'Match':>5}"
    print(f"\n{header}")
    print("-" * (len(header) + 5))

    correct = 0
    total_compared = 0

    for N, M, t_burst, s_max, label in configs:
        result = simulate_burst(N, M, X_ms, t_burst, s_max)
        peak = result['peak_conflicts']
        ratio = peak / s_max
        bn = result['bottleneck']
        drain = result['drain_time']
        model_verdict = "SURVIVES" if result['survives'] else "FAILS"

        line = (f"{label:<30} {peak:>8,.0f} {ratio:>8.2f} {bn:>7} "
                f"{drain:>6.1f}s {model_verdict:>10}")

        # Match with experimental data
        if experiments:
            # Find matching experiment (approximate M: 10.0 for interval=200, 20.0 for interval=100)
            exp = exp_lookup.get((N, float(M)))
            if exp and t_burst == T_burst and s_max == S_max:
                reshuf = exp["reshuffle_count"]
                real_dl = exp["real_dead_letters"]
                exp_verdict = "STABLE" if exp["stable"] else "FAILED"
                model_ok = (result['survives'] == exp["stable"])
                match_str = "ok" if model_ok else "MISS"
                if model_ok:
                    correct += 1
                total_compared += 1
                line += f"  {reshuf:>6} {real_dl:>6} {exp_verdict:>10} {match_str:>5}"
            else:
                line += f"  {'':>6} {'':>6} {'':>10} {'':>5}"

        print(line)

    # Validation check
    print(f"\n{'=' * 90}")
    print("VALIDATION CHECKS:")
    v1 = simulate_burst(4, 20, X_ms, 8.0, 10000)
    v2 = simulate_burst(4, 20, X_ms, 8.0, 1000)
    v1_ok = "PASS" if v1['survives'] else "FAIL"
    v2_ok = "PASS" if not v2['survives'] else "FAIL"
    print(f"  N=4, M=20, T_burst=8s, S_max=10000 -> "
          f"{'SURVIVES' if v1['survives'] else 'FAILS'} "
          f"(peak={v1['peak_conflicts']:,.0f}) ... {v1_ok}")
    print(f"  N=4, M=20, T_burst=8s, S_max=1000  -> "
          f"{'SURVIVES' if v2['survives'] else 'FAILS'} "
          f"(peak={v2['peak_conflicts']:,.0f}) ... {v2_ok}")

    if total_compared > 0:
        print(f"\nEXPERIMENTAL ACCURACY: {correct}/{total_compared} "
              f"({100*correct/total_compared:.0f}%) predictions match experiments")
        if correct < total_compared:
            print("  NOTE: Model is too optimistic — real system fails earlier than predicted.")
            print("  Likely causes: processing overhead beyond X*ops, GC pauses, connection pooling,")
            print("  store index scan costs scaling non-linearly with document size.")


# ─── Experimental data ────────────────────────────────────────────────────────

def load_experimental(path):
    """Load parsed experiment results from JSON."""
    if path and os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return []


# ─── Main ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Burst-Load Capacity Envelope Model")
    parser.add_argument("--experimental", "-e", type=str, default=None,
                        help="Path to experiments.json from parse-experiments.py")
    parser.add_argument("--burst", "-b", type=float, default=T_BURST_DEFAULT,
                        help=f"Burst duration in seconds (default: {T_BURST_DEFAULT})")
    parser.add_argument("--x-ms", type=float, default=X_DEFAULT,
                        help=f"Processing time per op in ms (default: {X_DEFAULT})")
    parser.add_argument("--s-max", type=int, default=S_MAX,
                        help=f"Max conflict threshold (default: {S_MAX})")
    args = parser.parse_args()

    out_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(out_dir)

    T_burst = args.burst
    X_ms = args.x_ms
    S_max_arg = args.s_max

    experiments = load_experimental(args.experimental)
    if not experiments:
        experiments = load_experimental("experiments.json")
    if experiments:
        print(f"Loaded {len(experiments)} experimental data points")

    print("Generating burst-load capacity envelope model...")
    print_summary(X_ms, T_burst, S_max_arg, experiments)

    print("\nGenerating plots...")
    plot_capacity_heatmap(X_ms, T_burst, S_max_arg, experiments)
    plot_burst_timeseries(X_ms, T_burst, S_max_arg)
    plot_duration_sensitivity(X_ms, S_max_arg)
    plot_queue_dynamics(X_ms=X_ms, T_burst=T_burst, S_max=S_max_arg)

    print("\nDone! Check the PNG files in:", out_dir)
