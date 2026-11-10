#!/usr/bin/env python3
"""Refresh shard weights from the CI baseline collector's suites_raw.json."""

import argparse
import json
import math
from pathlib import Path
import statistics
import sys


PLATFORMS = {
    "Check Commit": ("Test (shard ", "test-weights.json"),
    "Check Windows": ("check-windows (shard ", "test-weights.windows.json"),
}


def refresh(root, rows, period):
    if not isinstance(rows, list) or not all(isinstance(row, dict) for row in rows):
        raise ValueError("expected an array of suite records")

    samples = {filename: {} for _, filename in PLATFORMS.values()}
    missing = set()
    for row in rows:
        if row.get("period") != period or row.get("runner") != "vitest":
            continue
        platform = PLATFORMS.get(row.get("workflow"))
        if platform is None:
            continue
        prefix, filename = platform
        if not isinstance(row.get("job"), str) or not row["job"].startswith(prefix):
            continue
        failed = row.get("failed")
        if type(failed) is not int or failed < 0:
            raise ValueError("matching suite is missing a valid failed-test count")
        if failed:
            continue
        duration = row.get("duration_s")
        if (
            type(duration) not in (int, float)
            or not math.isfinite(duration)
            or duration <= 0
        ):
            raise ValueError("successful suite must have a positive finite duration_s")
        if type(row.get("passed")) is not int or row["passed"] <= 0:
            raise ValueError("successful suite must have at least one passed test")
        package = row.get("package")
        if not isinstance(package, str) or not package or package == "(job)":
            raise ValueError("matching suite must name a package directory")
        directory = (root / package).resolve()
        if not directory.is_relative_to(root) or directory == root:
            raise ValueError(f"package directory is outside the workspace: {package}")
        manifest = directory / "package.json"
        if not manifest.is_file():
            missing.add(package)
            continue
        name = json.loads(manifest.read_text())["name"]
        if not isinstance(name, str) or not name:
            raise ValueError(f"invalid package name in {manifest}")
        samples[filename].setdefault(name, []).append(duration)

    updates = {}
    for filename, measurements in samples.items():
        if not measurements:
            raise ValueError(
                f"no successful package measurements for {filename} in {period!r}"
            )
        path = root / "scripts" / filename
        weights = json.loads(path.read_text())
        if not isinstance(weights, dict) or any(
            type(value) not in (int, float) or not math.isfinite(value) or value < 0
            for value in weights.values()
        ):
            raise ValueError(f"invalid existing weights in {path}")
        weights.update(
            {
                name: round(statistics.median(values), 1)
                for name, values in measurements.items()
            }
        )
        updates[path] = json.dumps(weights, indent=2, sort_keys=True) + "\n"
    return updates, samples, missing


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("suites", type=Path, help="path to suites_raw.json")
    parser.add_argument("--period", required=True, help="exact period label in the input")
    parser.add_argument(
        "--check", action="store_true", help="check reproducibility without writing"
    )
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    try:
        updates, samples, missing = refresh(
            root, json.loads(args.suites.read_text()), args.period
        )
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(2, f"error: {error}\n")

    for package in sorted(missing):
        print(f"Skipping removed package: {package}", file=sys.stderr)
    changed = False
    for path, content in updates.items():
        different = path.read_text() != content
        changed |= different
        if not args.check:
            path.write_text(content)
        measurements = samples[path.name]
        count = sum(map(len, measurements.values()))
        print(f"{path.name}: {len(measurements)} packages, {count} samples")
    if args.check and changed:
        parser.exit(1, "weights differ; rerun without --check to refresh\n")


if __name__ == "__main__":
    main()
