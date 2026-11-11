import { z } from "zod";
import type { ScalarDefinition } from "../../../src/scalars/types.js";
import { describe, expect, it } from "vitest";
import { evaluate } from "@powerhousedao/shared/document-model";
import { storedScalarDefinition } from "../../../src/scalars/stored-definition.js";
import { defineScalar } from "../../../src/scalars/define-scalar.js";
import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";
import { checkDocumentModelDefinitionShape } from "../../../src/definition/compiler/wire-shape.js";

const transformed = defineScalar({
  name: "AuthUppercase",
  representation: "string",
  schema: z.string().transform((value) => value.toUpperCase()),
});
const custom = defineScalar({
  name: "AuthCustomString",
  schema: z.custom<string>(
    (value) => typeof value === "string" && value.length > 0,
  ),
  representation: "string",
});

const customPipe = defineScalar({
  name: "AuthCustomPipe",
  schema: z
    .custom<string>((value) => typeof value === "string" && value.length > 0)
    .transform((value) => value.toUpperCase()),
  representation: "string",
});

function modelWithScalar(
  scalar: ScalarDefinition<string, string>,
  literal = "lower",
) {
  const context = defineDocumentModel({
    id: `auth-scalars/${scalar.name}`,
    name: scalar.name,
    description: "Authorization scalar inputs",
    extension: "scalar",
    version: 1,
    author: { name: "Test" },
    scopes: {
      global: {
        schema: ph.object(`${scalar.name}State`, {
          fields: { value: ph.scalar(scalar, { required: true }) },
        }),
        initialValue: { value: "lower" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const module = context.module("edit", {
    operations: ({ global }) => ({
      setValue: global({
        input: ph.input({
          fields: { value: ph.scalar(scalar, { required: true }) },
        }),
        reduce(state, input) {
          state.value = input.value;
        },
      }),
    }),
  });
  const ordinary = materialize(context.version({ modules: [module] }));
  const protectedModel = materialize(
    context.version({
      modules: [module],
      auth: ({ policy: p, platform, operations, scopes }) =>
        p.initial({
          version: 1,
          bindings: p.bindings({}),
          grants: [
            p.allow({
              id: "admin",
              description: "Admin",
              principal: p.anyone(),
              target: p.execute(platform.auth.setGrant),
            }),
            p.allow({
              id: "edit",
              description: "Recorded input",
              principal: p.anyone(),
              target: p.execute(operations.edit.setValue),
              where: ({ input }) => p.eq(input.value, literal),
            }),
            p.allow({
              id: "read",
              description: "Recorded state",
              principal: p.anyone(),
              target: p.read(scopes.global),
              where: ({ state }) => p.eq(state.value, "lower"),
            }),
          ],
        }),
    }),
  );
  return { ordinary, protectedModel };
}

describe("initial auth with package scalars", () => {
  it.each([transformed, custom, customPipe])(
    "compares recorded primitives and preserves validation after serialization for $name",
    (scalar) => {
      const { ordinary, protectedModel } = modelWithScalar(scalar);
      const definition: unknown = JSON.parse(
        JSON.stringify(protectedModel.definition),
      );
      expect(checkDocumentModelDefinitionShape(definition)).toEqual([]);
      expect(definition).toMatchObject({
        specifications: [
          { scalars: [{ definition: { representation: "string" } }] },
        ],
      });
      expect(protectedModel.definition.specifications[0].scalars).toEqual(
        ordinary.definition.specifications[0].scalars,
      );
      expect(protectedModel.definition.specifications[0].scalars).toEqual([
        expect.objectContaining({ definition: storedScalarDefinition(scalar) }),
      ]);
      const policy = protectedModel.initialAuth.resolve({
        deployment: {},
        instance: {},
      });
      const request = {
        verb: "execute",
        scope: "global",
        operation: "SET_VALUE",
      } as const;
      const inputs = ["lower", "LOWER"];
      for (const [index, value] of inputs.entries()) {
        expect(
          evaluate(
            policy,
            {},
            request,
            {},
            { scopeState: { value: "lower" }, actionInput: { value } },
          ).decision,
        ).toBe(index === 0 ? "allow" : "deny");
      }
      expect(policy.grants[1].where).toEqual({
        eq: [{ attr: "action.input.value" }, { lit: "lower" }],
      });
    },
  );

  it("requires explicit primitive representation for opaque transform metadata", () => {
    const implicit = defineScalar({
      name: "AuthImplicit",
      schema: z.string().transform((value) => value.toUpperCase()),
    });
    expect(() => modelWithScalar(implicit)).toThrow(
      /must declare representation/u,
    );
  });

  it("retains custom scalar literal validation", () => {
    expect(() => modelWithScalar(custom, "")).toThrow(/comparison literal/u);
  });

  it("does not use a transform's object output as the recorded input shape", () => {
    const wrapped = defineScalar({
      name: "AuthWrapped",
      schema: z
        .union([z.string(), z.object({ value: z.string() })])
        .transform((value) => (typeof value === "string" ? { value } : value)),
      representation: "json-object",
    });
    const context = defineDocumentModel({
      id: "auth-scalars/wrapped",
      name: "Wrapped",
      description: "",
      extension: "scalar",
      version: 1,
      author: { name: "Test" },
      scopes: {
        global: {
          schema: ph.object("WrappedState", {
            fields: { value: ph.scalar(wrapped, { required: true }) },
          }),
          initialValue: { value: { value: "original" } },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const module = context.module("edit", {
      operations: ({ global }) => ({
        setValue: global({
          input: ph.input({
            fields: { value: ph.scalar(wrapped, { required: true }) },
          }),
          reduce(state, input) {
            state.value = input.value;
          },
        }),
      }),
    });
    expect(() =>
      context.version({
        modules: [module],
        auth: ({ policy: p, operations, platform }) =>
          p.initial({
            version: 1,
            bindings: p.bindings({}),
            grants: [
              p.allow({
                id: "admin",
                description: "Admin",
                principal: p.anyone(),
                target: p.execute(platform.auth.setGrant),
              }),
              p.allow({
                id: "edit",
                description: "Wrong parsed shape",
                principal: p.anyone(),
                target: p.execute(operations.edit.setValue),
                where: ({ input }) => p.eq(input.value.value, "original"),
              }),
            ],
          }),
      }),
    ).toThrow(/Unknown authorization field/u);
  });
});
