import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCANNED = ["packages", "apps", "clis"];
const SKIPPED_DIRS = new Set([
  "node_modules",
  "dist",
  ".tsbuild",
  "test",
  "tests",
  "bench",
  "coverage",
  ".ph",
  "storybook-static",
]);
const SOURCE = /\.(ts|tsx|mts)$/;
const NOT_PRODUCTION = /\.(test|spec|stories|d)\.(ts|tsx|mts)$/;

/** A raw read of the version, which only selection and the table may do: indexed, `get`, or destructured. */
const RAW_READ =
  /\[\s*["']base-reducer["']\s*\]|\.get\(\s*["']base-reducer["']|\{[^{}]*["']base-reducer["']\s*:\s*[A-Za-z_$][\w$]*\s*[,}][^{}=]*=[^=>]/;
const VERSION =
  /(?:\b\w*(?:protocolVersion|baseReducerVersion)\b|\[\s*["']base-reducer["']\s*\])/
    .source;
const OPERATOR = /(?:[!=]==?|[<>]=?)/.source;
/** A capability row's `version`: `caps.version`, `capabilitiesOf(v)?.version`. */
const CAPS_VERSION =
  /\b\w*(?:[cC]aps|[cC]apabilit\w*)(?:\([^()]*\))?\??\.version\b/.source;
/** A comparison against a version number instead of a capability read. */
const VERSION_COMPARE = new RegExp(
  [
    `${VERSION}\\s*\\)?\\s*${OPERATOR}\\s*\\d`,
    `\\d\\s*${OPERATOR}\\s*\\(?\\s*${VERSION}`,
    `${CAPS_VERSION}\\s*\\)?\\s*${OPERATOR}\\s*\\d`,
    `\\d\\s*${OPERATOR}\\s*\\(?\\s*${CAPS_VERSION}`,
    /\bversion\s*[!=]==\s*3\b/.source,
  ].join("|"),
);
/** A switch discriminant that names a version. */
const VERSION_DISCRIMINANT = /version|base-reducer/i;
/** A case label that is a number. */
const NUMERIC_CASE = /\bcase\s+\d+\s*:/;

/** A capability axis compared directly instead of read through a decision or an exhaustive switch. */
const AXIS_COMPARE = [
  /\.(tieOrder|derivation|reducerContract|synthesizedId|replayHash)\s*[!=]==/,
  /\b\w*caps\??\.(undo|skip)\s*[!=]==/i,
  /[!=]==\s*["'](retraction|noop-chain|canonical|rank-locale|rewind|undo-or-rewind|retraction-rule|state-reducer)["']/,
  /["'](retraction|noop-chain|canonical|rank-locale|rewind|undo-or-rewind|retraction-rule|state-reducer)["']\s*[!=]==/,
];

/** Files that decide on capability axes: the table, the order rules and the undo plan. */
const AXIS_OWNERS = new Set([
  "packages/shared/document-model/base-reducer-protocol.ts",
  "packages/shared/document-model/action-order.ts",
  "packages/shared/document-model/undo-redo-plan.ts",
]);

/** Files that read the version by design: the table, selection and backfill. */
const OWNERS = new Set([
  "packages/shared/document-model/base-reducer-protocol.ts",
  "packages/shared/document-model/create-base-reducer.ts",
  "packages/shared/document-model/files.ts",
  "packages/shared/document-model/peer-agreement.ts",
  "packages/shared/document-model/signature-policy.ts",
  "packages/reactor/src/client/create-protocol.ts",
]);

/** Not yet on capabilities, with who converts each; the list only shrinks. */
const PENDING = new Map<string, string>([]);

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        yield* sources(join(dir, entry.name));
      }
    } else if (SOURCE.test(entry.name) && !NOT_PRODUCTION.test(entry.name)) {
      yield join(dir, entry.name);
    }
  }
}

/** `source` with comments and string contents blanked, offsets and newlines kept. Regex literals are not recognised. */
function blankedCode(source: string): string {
  const out = source.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== c) {
        if (source[j] === "\\") j++;
        else if (c !== "`" && source[j] === "\n") break;
        j++;
      }
      blank(i + 1, Math.min(j, source.length));
      i = j + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

function closing(code: string, open: number, pair: string): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === pair[0]) depth++;
    else if (code[i] === pair[1] && --depth === 0) return i;
  }
  return -1;
}

/** Lines of each `switch` over a version that labels its cases with numbers. */
function numericVersionSwitches(source: string): string[] {
  const code = blankedCode(source);
  const hits: string[] = [];
  for (const match of code.matchAll(/\bswitch\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = closing(code, open, "()");
    const body = close === -1 ? -1 : code.indexOf("{", close);
    const end = body === -1 ? -1 : closing(code, body, "{}");
    if (end === -1) continue;
    if (!VERSION_DISCRIMINANT.test(source.slice(open + 1, close))) continue;
    if (!NUMERIC_CASE.test(code.slice(body, end))) continue;
    const line = source.slice(0, match.index).split("\n").length;
    hits.push(`${line}: ${source.split("\n")[line - 1].trim()}`);
  }
  return hits;
}

function offenders(
  hitsIn: (source: string) => string[],
): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const top of SCANNED) {
    for (const path of sources(join(ROOT, top))) {
      const file = relative(ROOT, path).split("\\").join("/");
      const hits = hitsIn(readFileSync(path, "utf8"));
      if (hits.length > 0) found.set(file, hits);
    }
  }
  return found;
}

function lineHits(matches: (line: string) => boolean) {
  return (source: string) =>
    source
      .split("\n")
      .flatMap((line, i) =>
        matches(line) ? [`${i + 1}: ${line.trim()}`] : [],
      );
}

/** Every raw read, numeric comparison or numeric switch on a version in `source`. */
function versionSeamHits(source: string): string[] {
  return [
    ...lineHits((line) => RAW_READ.test(line) || VERSION_COMPARE.test(line))(
      source,
    ),
    ...numericVersionSwitches(source),
  ];
}

describe("the base-reducer version seam", () => {
  const found = offenders(versionSeamHits);

  it("reads versions only through the capability table", () => {
    const unexpected = [...found].filter(
      ([file]) => !OWNERS.has(file) && !PENDING.has(file),
    );
    expect(Object.fromEntries(unexpected)).toEqual({});
  });

  it("drops a pending entry once its file is converted", () => {
    const converted = [...PENDING.keys()].filter((file) => !found.has(file));
    expect(converted).toEqual([]);
  });
});

describe("the version seam detector", () => {
  it.each([
    [
      "a numeric switch on a version",
      `switch (protocolVersion) {\n  case 1:\n    break;\n  case 3: {\n  }\n}`,
    ],
    [
      "a numeric switch on a raw read",
      `switch (header.protocolVersions?.["base-reducer"]) {\n  default:\n  case 2:\n}`,
    ],
    ["a relational comparison", `if (protocolVersion >= 3) run();`],
    ["a reversed comparison", `if (3 <= baseReducerVersion(header)) run();`],
    ["a capability row's version compared", `if (caps.version >= 3) run();`],
    ["a capability row's version equated", `if (caps.version === 2) run();`],
    [
      "a looked-up row's version compared",
      `if (baseReducerCapabilities(header).version > 2) run();`,
    ],
    [
      "a reversed optional row comparison",
      `if (3 !== capabilitiesFor(versions)?.version) run();`,
    ],
    ["a Map read", `const v = versions.get("base-reducer");`],
    [
      "a destructured read",
      `const { "base-reducer": v } = header.protocolVersions;`,
    ],
  ])("flags %s", (_name, source) => {
    expect(versionSeamHits(source)).not.toEqual([]);
  });

  it.each([
    [
      "a switch on an enum-labelled context version",
      `switch (contextVersion) {\n  case ContextVersion.V2:\n    return context;\n}`,
    ],
    [
      "a numeric switch on something else",
      `switch (kind) {\n  case 1:\n    break;\n}`,
    ],
    [
      "a model version comparison",
      `if (fromVersion > 0 && version < 2) skip();`,
    ],
    [
      "a numeric case label inside a string or comment",
      `switch (version) {\n  // case 1:\n  default: log("case 2:");\n}`,
    ],
    ["building a header", `return { ...rest, "base-reducer": fitted };`],
    ["passing the row's version on", `const protocolVersion = caps.version;`],
    ["naming the row's version in a refusal", `caps.version,`],
    [
      "defaulting a missing row's version",
      `capabilitiesFor(versions)?.version ?? 0,`,
    ],
    [
      "the row's version in a message",
      "`no state reducers for base-reducer ${caps.version}`,",
    ],
    ["another record's version compared", `if (token.version !== 1) throw;`],
  ])("passes %s", (_name, source) => {
    expect(versionSeamHits(source)).toEqual([]);
  });
});

describe("the capability axes", () => {
  it("are compared only by their owners", () => {
    const found = offenders(
      lineHits((line) => AXIS_COMPARE.some((pattern) => pattern.test(line))),
    );
    const unexpected = [...found].filter(([file]) => !AXIS_OWNERS.has(file));
    expect(Object.fromEntries(unexpected)).toEqual({});
  });
});
