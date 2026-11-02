import { describe, expect, it } from "vitest";
import { z } from "zod";
import { statedRepresentation } from "../../src/scalars/representation.js";

describe("statedRepresentation", () => {
  it.each([
    ["z.json()", z.json(), "json"],
    ["z.string().nullable()", z.string().nullable(), "string"],
    [
      "z.union([z.string(), z.null()])",
      z.union([z.string(), z.null()]),
      "string",
    ],
    ["z.literal([null, 1])", z.literal([null, 1]), "number"],
    ["z.null()", z.null(), undefined],
    ["z.custom()", z.custom(() => true), undefined],
    [
      "z.union([z.custom(), z.string()])",
      z.union([z.custom(() => true), z.string()]),
      undefined,
    ],
    [
      "z.intersection(z.custom(), z.number())",
      z.intersection(
        z.custom(() => true),
        z.number(),
      ),
      "number",
    ],
    [
      "z.string().nullable().and(z.union([z.string(), z.number()]))",
      z
        .string()
        .nullable()
        .and(z.union([z.string(), z.number()])),
      "string",
    ],
    [
      'z.union([z.string(), z.boolean()]).meta({ id: "Shape/AB" }).and(...)',
      z
        .union([z.string(), z.boolean()])
        .meta({ id: "Shape/AB" })
        .and(z.union([z.string(), z.number()])),
      "string",
    ],
    [
      "z.intersection(z.string(), z.number())",
      z.intersection(z.string(), z.number()),
      undefined,
    ],
    [
      'z.lazy(() => z.string()).meta({ id: "Name~1" })',
      z.lazy(() => z.string()).meta({ id: "Name~1" }),
      "string",
    ],
  ])("states %s as %s", (_, schema, representation) => {
    expect(statedRepresentation(schema)).toBe(representation);
  });
});
