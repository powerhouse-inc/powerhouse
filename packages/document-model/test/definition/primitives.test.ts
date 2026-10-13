import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  canonicalDigest,
  canonicalJson,
  compareCodeUnits,
  isAuthoredSchemaName,
  isEnumValueName,
  isGraphQLName,
  isNFC,
  isSha256Digest,
  sha256,
} from "../../src/definition/primitives.js";

function nodeSha256(input: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

describe("canonicalJson", () => {
  it("sorts members by UTF-16 code units where locale order differs", () => {
    expect(canonicalJson({ ä: 1, Z: 2, a: 3 })).toBe('{"Z":2,"a":3,"ä":1}');
    expect(["ä", "Z", "a"].sort((x, y) => x.localeCompare(y))).toStrictEqual([
      "a",
      "ä",
      "Z",
    ]);
  });

  it("keeps array order and sorts nested members at every depth", () => {
    expect(canonicalJson([3, 1, { b: { d: 1, c: 2 }, a: [] }])).toBe(
      '[3,1,{"a":[],"b":{"c":2,"d":1}}]',
    );
  });

  it("encodes numbers as JSON.stringify does, including -0", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(canonicalJson(1.5e300)).toBe("1.5e+300");
    expect(canonicalJson(0.1)).toBe("0.1");
    expect(canonicalJson(-42)).toBe("-42");
  });

  it("escapes strings as JSON.stringify does", () => {
    expect(canonicalJson("\u0000\u001f\n\t")).toBe('"\\u0000\\u001f\\n\\t"');
    expect(canonicalJson("😀")).toBe('"😀"');
    expect(canonicalJson("\uD800")).toBe('"\\ud800"');
    expect(canonicalJson('"\\')).toBe('"\\"\\\\"');
  });

  it("accepts a null-prototype object", () => {
    const bare: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    bare.b = 1;
    bare.a = 2;
    expect(canonicalJson(bare)).toBe('{"a":2,"b":1}');
  });

  it("produces identical bytes and digests for different insertion orders", () => {
    const first = { z: [{ b: 1, a: 2 }], a: "x", m: { y: true, x: null } };
    const second = { m: { x: null, y: true }, a: "x", z: [{ a: 2, b: 1 }] };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(canonicalDigest(first)).toBe(canonicalDigest(second));
  });

  const rejections: readonly [string, () => unknown, string][] = [
    [
      "a function",
      () => ({ run: () => 1 }),
      "$.run must be a JSON value, received function.",
    ],
    [
      "a symbol",
      () => ({ tag: Symbol("t") }),
      "$.tag must be a JSON value, received symbol.",
    ],
    [
      "an undefined member",
      () => ({ a: undefined }),
      "$.a must be a JSON value, received undefined.",
    ],
    [
      "an undefined element",
      () => [1, undefined],
      "$[1] must be a JSON value, received undefined.",
    ],
    [
      "a bigint",
      () => ({ n: 1n }),
      "$.n must be a JSON value, received bigint.",
    ],
    ["NaN", () => ({ n: NaN }), "$.n must be a finite number."],
    ["Infinity", () => [Infinity], "$[0] must be a finite number."],
    ["-Infinity", () => -Infinity, "$ must be a finite number."],
    [
      "a symbol key",
      () => ({ [Symbol("k")]: 1 }),
      "$ must not have symbol keys.",
    ],
    ["a Date", () => ({ at: new Date(0) }), "$.at must be a plain object."],
    ["a Map", () => new Map(), "$ must be a plain object."],
    [
      "a class instance",
      () => new (class Options {})(),
      "$ must be a plain object.",
    ],
    [
      "a sparse array",
      () => {
        const holes = new Array<number>(3);
        holes[0] = 1;
        holes[2] = 3;
        return holes;
      },
      "$[1] must not be an array hole.",
    ],
    [
      "an array with a custom property",
      () => Object.assign([1], { x: 1 }),
      '$ must not have a non-index property "x".',
    ],
    [
      "a non-enumerable property",
      () => Object.defineProperty({}, "h", { value: 1, enumerable: false }),
      "$.h must be enumerable.",
    ],
    [
      "a key that is not an identifier, with a bracket path",
      () => ({ "a b": undefined }),
      '$["a b"] must be a JSON value, received undefined.',
    ],
  ];

  it.each(rejections)("rejects %s", (_name, make, message) => {
    expect(() => canonicalJson(make())).toThrow(new TypeError(message));
  });

  it("rejects a getter without invoking it", () => {
    let invoked = false;
    const value = {
      get secret() {
        invoked = true;
        return 1;
      },
    };
    expect(() => canonicalJson(value)).toThrow(
      "$.secret must be a data property, not an accessor.",
    );
    expect(invoked).toBe(false);
  });

  it("rejects a cycle and names the path where it closes", () => {
    const root: Record<string, unknown> = {};
    root.self = { back: root };
    expect(() => canonicalJson(root)).toThrow(
      "$.self.back must not contain a cycle.",
    );
    const list: unknown[] = [];
    list.push(list);
    expect(() => canonicalJson(list)).toThrow("$[0] must not contain a cycle.");
  });

  it("allows the same object to appear twice when it is not an ancestor", () => {
    const shared = { a: 1 };
    expect(canonicalJson([shared, shared])).toBe('[{"a":1},{"a":1}]');
  });
});

describe("sha256", () => {
  it("pins the standard vectors", () => {
    expect(sha256("")).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  const inputs: readonly (string | Uint8Array)[] = [
    "",
    "a",
    "a".repeat(55),
    "a".repeat(56),
    "a".repeat(63),
    "a".repeat(64),
    "a".repeat(65),
    "a".repeat(119),
    "a".repeat(120),
    "x".repeat(1000),
    "ünïcödé 😀 文字",
    Uint8Array.from([0, 1, 2, 253, 254, 255]),
    new Uint8Array(0),
  ];

  it.each(inputs.map((input, index) => [index, input] as const))(
    "matches node:crypto for input %i",
    (_index, input) => {
      expect(sha256(input)).toBe(nodeSha256(input));
    },
  );

  it("returns a digest synchronously when WebCrypto is absent", () => {
    vi.stubGlobal("crypto", undefined);
    try {
      const digest: unknown = sha256("abc");
      expect(typeof digest).toBe("string");
      expect(digest).toBe(
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("canonicalDigest", () => {
  const vectors: readonly [unknown, string, string][] = [
    [
      { b: 1, a: [true, null, "x"] },
      '{"a":[true,null,"x"],"b":1}',
      "sha256:54a65415ad370228851a1da4b31b6fd42dc58b19a50d35cae759325f7388ce64",
    ],
    [
      ["ä", "Z", "a", { z: -0, y: 1.5e300 }],
      '["ä","Z","a",{"y":1.5e+300,"z":0}]',
      "sha256:09a44a101b44c4af758b7ad50ec260acdff8fab7690c23e9a199cb10042944ac",
    ],
    [
      [
        "powerhouse.document-model.identity",
        1,
        "powerhouse/invoice",
        "module",
        "lineItems",
      ],
      '["powerhouse.document-model.identity",1,"powerhouse/invoice","module","lineItems"]',
      "sha256:661567d341dfe337b0be9463dc8b2ec28f797e2c07fb13d596775681d6183427",
    ],
  ];

  it.each(vectors)("pins %j", (input, bytes, digest) => {
    expect(canonicalJson(input)).toBe(bytes);
    expect(canonicalDigest(input)).toBe(digest);
    expect(nodeSha256(bytes)).toBe(digest);
  });
});

describe("isSha256Digest", () => {
  it("accepts only the prefixed lowercase 64-hex form", () => {
    expect(isSha256Digest(sha256("abc"))).toBe(true);
    expect(isSha256Digest(`sha256:${"A".repeat(64)}`)).toBe(false);
    expect(isSha256Digest(`sha256:${"a".repeat(63)}`)).toBe(false);
    expect(isSha256Digest("a".repeat(64))).toBe(false);
    expect(isSha256Digest(42)).toBe(false);
  });
});

describe("compareCodeUnits", () => {
  it("returns -1, 0, or 1 in code-unit order", () => {
    expect(compareCodeUnits("Z", "a")).toBe(-1);
    expect(compareCodeUnits("a", "ä")).toBe(-1);
    expect(compareCodeUnits("ä", "Z")).toBe(1);
    expect(compareCodeUnits("same", "same")).toBe(0);
    expect(compareCodeUnits("ab", "abc")).toBe(-1);
    expect(compareCodeUnits("", "a")).toBe(-1);
    expect(compareCodeUnits("😀", "￿")).toBe(-1);
  });
});

describe("name validators", () => {
  const cases: readonly [string, boolean, boolean, boolean][] = [
    ["Invoice", true, true, true],
    ["_private", true, true, true],
    ["a1", true, true, true],
    ["__typename", true, false, false],
    ["true", true, true, false],
    ["false", true, true, false],
    ["null", true, true, false],
    ["TRUE", true, true, true],
    ["1abc", false, false, false],
    ["with-dash", false, false, false],
    ["with space", false, false, false],
    ["", false, false, false],
    ["ünïcode", false, false, false],
  ];

  it.each(cases)(
    "%j: lexical %s, authored %s, enum value %s",
    (value, lexical, authored, enumValue) => {
      expect(isGraphQLName(value)).toBe(lexical);
      expect(isAuthoredSchemaName(value)).toBe(authored);
      expect(isEnumValueName(value)).toBe(enumValue);
    },
  );

  it("rejects non-strings", () => {
    expect(isGraphQLName(1)).toBe(false);
    expect(isAuthoredSchemaName(null)).toBe(false);
    expect(isEnumValueName(undefined)).toBe(false);
  });
});

describe("isNFC", () => {
  it("distinguishes composed from decomposed forms without normalizing", () => {
    const composed = "\u00e9";
    const decomposed = "e\u0301";
    expect(composed).not.toBe(decomposed);
    expect(isNFC(composed)).toBe(true);
    expect(isNFC(decomposed)).toBe(false);
    expect(isNFC("plain")).toBe(true);
    expect(isNFC("")).toBe(true);
  });
});

describe("primitives.ts source", () => {
  const source = readFileSync(
    new URL("../../src/definition/primitives.ts", import.meta.url),
    "utf8",
  );

  it("imports nothing but the shared wire types", () => {
    const imports = source.match(/^import .*$/gm) ?? [];
    expect(imports).toStrictEqual([
      'import type { Sha256Digest } from "@powerhousedao/shared/document-model";',
    ]);
  });

  it("uses no host crypto, so Node and browser builds run the same code", () => {
    expect(source).not.toMatch(/node:/);
    expect(source).not.toMatch(/\bcrypto\b/);
  });
});
