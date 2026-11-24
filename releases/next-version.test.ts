import { describe, expect, test } from "bun:test";
import { nextBranchVersion, parseVersionPrefix } from "./next-version";

const range = (line: string, from: number, to: number): string[] =>
  Array.from({ length: to - from + 1 }, (_, i) => `${line}-next.${from + i}`);

describe("parseVersionPrefix", () => {
  test.each([
    ["6", { form: "major", major: 6 }],
    ["0", { form: "major", major: 0 }],
    ["6.4", { form: "minor", major: 6, minor: 4 }],
    ["6.4.1", { form: "patch", major: 6, minor: 4, patch: 1 }],
    [" 6.4 ", { form: "minor", major: 6, minor: 4 }],
  ] as const)("%p", (input, expected) => {
    expect(parseVersionPrefix(input)).toEqual(expected);
  });

  test.each(["", "  ", "v6.4", "6.4.x", "06.4", "6.4.1.2", "latest", "6."])(
    "refuses %p",
    (input) => {
      expect(() => parseVersionPrefix(input)).toThrow(/version_prefix/);
    },
  );
});

describe("nextBranchVersion", () => {
  const resolves: [string, string, string, string[], string][] = [
    [
      "1 first build",
      "6.4",
      "6.3.0-dev.8",
      ["6.3.0-dev.8", "6.2.3"],
      "6.4.0-next.0",
    ],
    [
      "2 counter continues",
      "6.4",
      "6.4.0-next.1",
      ["6.4.0-next.0", "6.4.0-next.1"],
      "6.4.0-next.2",
    ],
    [
      "3 patch prefix opens a line",
      "6.4.1",
      "6.4.0-next.1",
      ["6.4.0-next.0", "6.4.0-next.1"],
      "6.4.1-next.0",
    ],
    [
      "4 minor prefix follows the highest line",
      "6.4",
      "6.4.1-next.0",
      ["6.4.0-next.0", "6.4.0-next.1", "6.4.1-next.0"],
      "6.4.1-next.1",
    ],
    [
      "5 major prefix follows the highest line",
      "6",
      "6.4.1-next.0",
      ["6.4.0-next.3", "6.4.1-next.0", "6.5.0-next.2"],
      "6.5.0-next.3",
    ],
    [
      "10 gap kept",
      "6.4",
      "6.3.0-dev.8",
      ["6.4.0-next.0", "6.4.0-next.2"],
      "6.4.0-next.3",
    ],
    ["11 tag only", "6.4", "6.3.0-dev.8", ["v6.4.0-next.0"], "6.4.0-next.1"],
    [
      "12 look-alikes ignored",
      "6.4",
      "6.3.0-dev.8",
      ["6.4.0-next.0.1", "6.4.0-nextgen.0", "6.4.0-next.x", "6.4.0-next.01"],
      "6.4.0-next.0",
    ],
    ["14 new major by minor prefix", "7.0", "6.4.0-next.1", [], "7.0.0-next.0"],
    [
      "15 numeric compare",
      "6.10",
      "6.9.0-dev.1",
      ["6.9.0-next.3"],
      "6.10.0-next.0",
    ],
    ["17 same line allowed", "6.3.0", "6.3.0-dev.8", ["6.2.3"], "6.3.0-next.0"],
    [
      "19 another branch published",
      "6.4",
      "6.4.0-next.3",
      range("6.4.0", 0, 7),
      "6.4.0-next.8",
    ],
    ["20 trimmed", " 6.4 ", "6.3.0-dev.8", [], "6.4.0-next.0"],
    [
      "numeric counter compare",
      "6.4",
      "6.4.0-next.9",
      range("6.4.0", 0, 10),
      "6.4.0-next.11",
    ],
  ];

  test.each(resolves)("%s", (_name, prefix, diskVersion, taken, expected) => {
    expect(nextBranchVersion({ prefix, diskVersion, taken })).toBe(expected);
  });

  const refuses: [string, string, string, string[], RegExp][] = [
    [
      "6 major prefix without a build",
      "6",
      "6.3.0-dev.8",
      ["6.3.0-dev.8"],
      /no -next build on 6\.x/,
    ],
    [
      "7 lower than the branch",
      "6.3",
      "6.4.0-next.1",
      ["6.4.0-next.1"],
      /6\.3\.0 line, lower than 6\.4\.0/,
    ],
    [
      "8 released (patch prefix)",
      "6.4.0",
      "6.4.0-next.5",
      ["6.4.0-next.5", "6.4.0"],
      /6\.4\.0 is already released/,
    ],
    [
      "9 released (minor prefix)",
      "6.4",
      "6.4.0",
      ["6.4.0-next.5", "6.4.0"],
      /6\.4\.0 is already released/,
    ],
    [
      "13 major prefix on a new major",
      "7",
      "6.4.0-next.1",
      [],
      /no -next build on 7\.x/,
    ],
    [
      "16 major prefix, highest line below the branch",
      "6",
      "6.3.0-dev.8",
      ["6.2.3-next.4"],
      /6\.2\.3 line, lower than 6\.3\.0/,
    ],
    [
      "18 not above the disk version",
      "6.4",
      "6.4.0-rc.1",
      ["6.4.0-rc.1"],
      /6\.4\.0-next\.0, which is not above 6\.4\.0-rc\.1/,
    ],
    [
      "released version given as a tag",
      "6.4",
      "6.3.0-dev.8",
      ["v6.4.0"],
      /6\.4\.0 is already released/,
    ],
    ["22 invalid disk version", "6.4", "foo", [], /not valid semver/],
  ];

  test.each(refuses)(
    "refuses: %s",
    (_name, prefix, diskVersion, taken, message) => {
      expect(() => nextBranchVersion({ prefix, diskVersion, taken })).toThrow(
        message,
      );
    },
  );

  test.each(["", "v6.4", "6.4.x", "06.4", "6.4.1.2", "latest"])(
    "21 refuses invalid prefix %p",
    (prefix) => {
      expect(() =>
        nextBranchVersion({
          prefix,
          diskVersion: "6.3.0-dev.8",
          taken: ["6.4.0-next.0"],
        }),
      ).toThrow(/version_prefix .* is invalid/);
    },
  );
});
