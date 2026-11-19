import { readFileSync, writeFileSync } from "node:fs";
import { ownerOf } from "./scope.mjs";

// Line data is file -> (line -> hits); the reports use LCOV's SF/DA records and nothing else.
export function readLines(path) {
  const files = new Map();
  let lines;
  for (const record of readFileSync(path, "utf8").split("\n")) {
    if (record.startsWith("SF:")) {
      const file = record.slice(3);
      lines = files.get(file) ?? new Map();
      files.set(file, lines);
    } else if (record.startsWith("DA:") && lines) {
      const [line, hits] = record.slice(3).split(",");
      lines.set(Number(line), (lines.get(Number(line)) ?? 0) + Number(hits));
    }
  }
  return files;
}

export function writeLines(files, path) {
  const records = [];
  for (const file of [...files.keys()].sort()) {
    const lines = files.get(file);
    records.push(
      `SF:${file}`,
      ...[...lines.keys()]
        .sort((a, b) => a - b)
        .map((line) => `DA:${line},${lines.get(line)}`),
      "end_of_record",
    );
  }
  writeFileSync(path, records.length ? records.join("\n") + "\n" : "");
}

// Hits are summed per line; only the seed's files and lines are kept, so every layer shares one denominator.
export function layer(seed, inputs) {
  const result = new Map();
  for (const [file, lines] of seed) {
    const hits = new Map([...lines.keys()].map((line) => [line, 0]));
    for (const input of inputs)
      for (const [line, count] of input.get(file) ?? [])
        if (hits.has(line)) hits.set(line, hits.get(line) + count);
    result.set(file, hits);
  }
  return result;
}

export function totals(files) {
  let found = 0,
    hit = 0;
  for (const lines of files.values())
    for (const count of lines.values()) {
      found++;
      if (count > 0) hit++;
    }
  return { found, hit, percent: found ? (100 * hit) / found : 0 };
}

export function totalsByOwner(files) {
  const owners = new Map();
  for (const [file, lines] of files) {
    const owner = ownerOf(file);
    owners.set(owner, [...(owners.get(owner) ?? []), [file, lines]]);
  }
  return Object.fromEntries(
    [...owners.keys()]
      .sort()
      .map((owner) => [owner, totals(new Map(owners.get(owner)))]),
  );
}
