#!/usr/bin/env python3
"""
Parse experiment log directories and extract stability metrics.

Scans all timestamped log directories under logs/, reads run-info.json
and parses switchboard.log + combined.log for reshuffle errors and dead letters.

Outputs: experiments.json with per-run metrics for overlay on the model plots.

Usage: cd test/test-connect && .venv/bin/python3 src/parse-experiments.py
"""

import json
import os
import re
import sys
from pathlib import Path

LOG_DIR = Path("logs")
OUTPUT = Path("experiments.json")

# Patterns from analyze-logs.ts
TIMESTAMP_RE = re.compile(r"\[(\d{2}):(\d{2}):(\d{2})\.(\d{2,3})\]")
RESHUFFLE_RE = re.compile(r"\[Attempt (\d+)\] Excessive reshuffle")
DEAD_LETTER_RE = re.compile(r"\[SYNC\] DEAD LETTER:")
EXCESSIVE_RESHUFFLE_RE = re.compile(r"Excessive reshuffle detected")
PUSH_SUCCESS_RE = re.compile(r"PushSyncEnvelopes.*response.*200|push.*success", re.IGNORECASE)
PUSH_FAIL_RE = re.compile(r"PushSyncEnvelopes.*response.*(4\d{2}|5\d{2})|push.*fail", re.IGNORECASE)


def parse_timestamp_ms(line):
    """Extract timestamp as ms from start of day."""
    m = TIMESTAMP_RE.search(line)
    if not m:
        return None
    h, mi, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
    ms_str = m.group(4)
    ms = int(ms_str) * (10 if len(ms_str) == 2 else 1)  # "14" → 140ms, "140" → 140ms
    return ((h * 3600) + (mi * 60) + s) * 1000 + ms


def parse_log_dir(log_path):
    """Parse a single experiment log directory."""
    run_info_path = log_path / "run-info.json"
    if not run_info_path.exists():
        return None

    with open(run_info_path) as f:
        run_info = json.load(f)

    clients = run_info.get("clients", run_info.get("numClients"))
    interval = run_info.get("mutationInterval")
    duration = run_info.get("duration")

    # M ≈ avg_ops_per_call * 1000 / interval
    # generateOperations produces 1-3 ops (avg 2)
    m_ops_sec = 2.0 * 1000.0 / interval if interval else 0

    result = {
        "dir": str(log_path),
        "timestamp": log_path.name,
        "clients": clients,
        "mutationInterval": interval,
        "duration": duration,
        "M_approx": round(m_ops_sec, 1),
        "reshuffle_events": [],
        "dead_letter_count": 0,
        "first_reshuffle_ms": None,
        "first_dead_letter_ms": None,
        "max_reshuffle_attempt": 0,
        "stable": True,
    }

    # Parse all log files
    first_timestamp = None

    for log_file in ["switchboard.log", "combined.log"]:
        log_path_file = log_path / log_file
        if not log_path_file.exists():
            continue

        with open(log_path_file, errors="replace") as f:
            for line in f:
                ts = parse_timestamp_ms(line)

                # Track first timestamp as reference
                if ts is not None and first_timestamp is None:
                    first_timestamp = ts

                # Reshuffle events
                rm = RESHUFFLE_RE.search(line)
                if rm:
                    attempt = int(rm.group(1))
                    elapsed = (ts - first_timestamp) if ts and first_timestamp else None
                    result["reshuffle_events"].append({
                        "attempt": attempt,
                        "elapsed_ms": elapsed,
                    })
                    result["max_reshuffle_attempt"] = max(
                        result["max_reshuffle_attempt"], attempt
                    )
                    if result["first_reshuffle_ms"] is None and elapsed is not None:
                        result["first_reshuffle_ms"] = elapsed
                    result["stable"] = False

                # Dead letters
                if DEAD_LETTER_RE.search(line):
                    result["dead_letter_count"] += 1
                    elapsed = (ts - first_timestamp) if ts and first_timestamp else None
                    if result["first_dead_letter_ms"] is None and elapsed is not None:
                        result["first_dead_letter_ms"] = elapsed
                    result["stable"] = False

                # Excessive reshuffle in error messages
                if EXCESSIVE_RESHUFFLE_RE.search(line) and not rm:
                    result["stable"] = False

    result["reshuffle_count"] = len(result["reshuffle_events"])
    return result


def main():
    if not LOG_DIR.exists():
        print(f"No logs directory found at {LOG_DIR}")
        sys.exit(1)

    # Find all timestamped subdirectories
    log_dirs = sorted(
        [d for d in LOG_DIR.iterdir() if d.is_dir() and d.name != "switchboard-data"],
        key=lambda d: d.name,
    )

    if not log_dirs:
        print("No experiment log directories found.")
        sys.exit(1)

    experiments = []
    for d in log_dirs:
        result = parse_log_dir(d)
        if result:
            experiments.append(result)

    # Write JSON
    with open(OUTPUT, "w") as f:
        json.dump(experiments, f, indent=2)

    # Print summary
    print(f"Parsed {len(experiments)} experiments → {OUTPUT}")
    print()
    print(f"{'Dir':>24s}  {'N':>2}  {'M':>5}  {'Int':>5}  {'Stable':>7}  "
          f"{'Reshuffles':>10}  {'DeadLetters':>11}  {'1st Fail (s)':>12}")
    print("-" * 100)

    for e in experiments:
        first_fail = None
        if e["first_reshuffle_ms"] is not None:
            first_fail = f"{e['first_reshuffle_ms'] / 1000:.1f}"
        elif e["first_dead_letter_ms"] is not None:
            first_fail = f"{e['first_dead_letter_ms'] / 1000:.1f}"

        print(f"{e['timestamp']:>24s}  {e['clients']:>2}  {e['M_approx']:>5.1f}  "
              f"{e['mutationInterval']:>5}  {'YES' if e['stable'] else 'NO':>7}  "
              f"{e['reshuffle_count']:>10}  {e['dead_letter_count']:>11}  "
              f"{first_fail or '-':>12}")

    print()
    print(f"Next: .venv/bin/python3 src/reshuffle-model.py --experimental {OUTPUT}")


if __name__ == "__main__":
    main()
