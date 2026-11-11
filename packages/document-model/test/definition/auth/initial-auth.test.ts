import type { InitialAuthContext } from "../../../src/definition/index.js";
import {
  authAddress,
  authGroupId,
  evaluate,
  initialAuthDigest,
  resolveInitialAuthTemplate,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  DefinitionError,
  defineDocumentModelFamily,
  inspectDocumentModelDefinition,
  materialize,
} from "../../../src/definition/index.js";
import { checkDocumentModelDefinitionShape } from "../../../src/definition/compiler/wire-shape.js";
import { noteContext, protectedNote } from "./fixture.js";

const values = {
  deployment: { administrator: authAddress("admin") },
  instance: {
    owner: authAddress("owner"),
    company: authGroupId("company-group"),
  },
};

describe("code-first initial authorization", () => {
  it("compiles real operation references and conditions, resolves identities and evaluates with existing auth", () => {
    const { module } = protectedNote();
    expect(module.definition.formatVersion).toBe(2);
    expect(inspectDocumentModelDefinition(module).kind).toBe("structured");
    expect(checkDocumentModelDefinitionShape(module.definition)).toEqual([]);
    const policy = module.initialAuth.resolve(values);
    expect(policy.creator).toBeUndefined();
    expect(policy.grants[2]).toMatchObject({
      capability: { can: "execute", scope: "global", operation: ["SET_TITLE"] },
      where: {
        and: [
          { eq: [{ attr: "doc.global.locked" }, { lit: false }] },
          {
            eq: [
              { attr: "action.input.generation" },
              { attr: "doc.global.attempts" },
            ],
          },
        ],
      },
    });
    const request = {
      verb: "execute" as const,
      scope: "global",
      operation: "SET_TITLE",
    };
    const conditions = {
      scopeState: { locked: false, attempts: 2 },
      actionInput: { title: "new", generation: 2 },
    };
    expect(
      evaluate(policy, { address: "owner" }, request, {}, conditions).decision,
    ).toBe("allow");
    expect(
      evaluate(policy, { address: "outsider" }, request, {}, conditions)
        .decision,
    ).toBe("deny");
    expect(
      evaluate(
        policy,
        { address: "owner" },
        request,
        {},
        { ...conditions, scopeState: { locked: true, attempts: 2 } },
      ).decision,
    ).toBe("deny");
    expect(
      evaluate(
        policy,
        { address: "owner" },
        request,
        {},
        { ...conditions, actionInput: { title: "new" } },
      ).decision,
    ).toBe("deny");
    expect(
      evaluate(
        policy,
        { address: "owner" },
        { ...request, operation: "PUBLISH" },
        {},
        conditions,
      ).decision,
    ).toBe("deny");
    expect(module.utils.createDocument().state.auth.version).toBe(0);
  });
  it("preserves templates per version through a family and leaves unprotected definitions unchanged", () => {
    const { note, notes } = noteContext();
    const ordinary = materialize(note.version({ modules: [notes] }));
    expect(ordinary.definition.formatVersion).toBe(1);
    expect(ordinary.initialAuth).toBeUndefined();
    expect(ordinary.utils.createState().auth).toEqual({
      version: 0,
      grants: [],
    });
    const { version } = protectedNote();
    const family = materialize(
      defineDocumentModelFamily({
        versions: [version],
        upgradeManifest: {
          documentType: "test/auth-note",
          latestVersion: 1,
          supportedVersions: [1],
          upgrades: {},
        },
      }),
    );
    expect(
      family.at(1).initialAuth.resolve(values).grants[1].principal,
    ).toEqual({ address: "owner" });
  });
  it("requires exact binding keys and validates concrete administration after substitution", () => {
    const { module } = protectedNote();
    expect(() =>
      module.initialAuth.resolve({
        ...values,
        instance: { ...values.instance, surprise: authAddress("x") },
      } as never),
    ).toThrow(/Unknown instance binding/u);
    expect(() =>
      module.initialAuth.resolve({
        deployment: {},
        instance: values.instance,
      } as never),
    ).toThrow(/Missing deployment/u);
    expect(() =>
      module.initialAuth.resolve({
        ...values,
        deployment: { administrator: " " },
      } as never),
    ).toThrow(/address/u);
    const template = structuredClone(module.initialAuth.template);
    template.grants.push({
      id: "block-owner-admin",
      description: "Deny owner admin",
      effect: "deny",
      principal: { binding: "owner" },
      capability: { can: "execute", scope: "auth" },
    });
    const { digest: _, ...body } = template;
    template.digest = initialAuthDigest(body);
    expect(() =>
      resolveInitialAuthTemplate(
        template,
        {
          ...values,
          instance: { ...values.instance, owner: authAddress("admin") },
        },
        "test/auth-note",
      ),
    ).toThrow(/reachable grant/u);
  });
  it("does not accept raw or foreign references even through unsafe casts", () => {
    const { note, notes } = noteContext();
    let foreign: unknown;
    note.version({
      modules: [notes],
      auth: ({ policy: p, platform }) => {
        foreign = platform.auth.setGrant;
        return p.initial({
          version: 1,
          bindings: p.bindings({}),
          grants: [
            p.allow({
              id: "admin",
              description: "admin",
              principal: p.anyone(),
              target: p.execute(platform.auth.setGrant),
            }),
          ],
        });
      },
    });
    for (const reference of [
      foreign,
      "SET_GRANT",
      { kind: "powerhouse.auth-operation" },
    ]) {
      expect(() =>
        note.version({
          modules: [notes],
          auth: ({ policy: p }) =>
            p.initial({
              version: 1,
              bindings: p.bindings({}),
              grants: [
                p.allow({
                  id: "admin",
                  description: "admin",
                  principal: p.anyone(),
                  target: p.execute(reference as never),
                }),
              ],
            }),
        }),
      ).toThrow(DefinitionError);
    }
  });
  it("rejects unsafe conditions, mixed scopes, empty lists, unknown fields and duplicate grants", () => {
    const { note, notes } = noteContext();
    const ordinary = materialize(note.version({ modules: [notes] }));
    type Context = InitialAuthContext<
      ReturnType<typeof ordinary.utils.createState>,
      readonly [typeof notes]
    >;
    const cases: ((context: Context) => unknown)[] = [
      ({ policy: p }) => p.executeMany([] as never),
      ({ policy: p, operations }) =>
        p.executeMany([
          operations.notes.setTitle,
          operations.notes.setDraft,
        ] as never),
      ({ policy: p, scopes }) =>
        p.allow({
          id: "x",
          description: "x",
          principal: p.anyone(),
          target: p.read(scopes.global),
          where: () => true as never,
        }),
      ({ policy: p, scopes }) =>
        p.allow({
          id: "x",
          description: "x",
          principal: p.anyone(),
          target: p.read(scopes.global),
          where: ({ state }) => p.eq(state.status, "DRAFFT" as never),
        }),
      ({ policy: p, scopes }) =>
        p.allow({
          id: "x",
          description: "x",
          principal: p.anyone(),
          target: p.read(scopes.global),
          where: ({ state }) => {
            const unknownState: Record<string, never> = state as never;
            return p.eq(unknownState.unknown, "x");
          },
        }),
      ({ policy: p, scopes }) =>
        p.allow({
          id: "x",
          description: "x",
          principal: p.anyone(),
          target: p.read(scopes.global),
          where: ({ state }) => p.eq(state.locked, state.attempts as never),
        }),
    ];
    for (const invoke of cases)
      expect(() =>
        note.version({
          modules: [notes],
          auth: (context) => {
            invoke(context);
            const p = context.policy;
            return p.initial({
              version: 1,
              bindings: p.bindings({}),
              grants: [
                p.allow({
                  id: "admin",
                  description: "admin",
                  principal: p.anyone(),
                  target: p.execute(context.platform.auth.setGrant),
                }),
              ],
            });
          },
        }),
      ).toThrow(DefinitionError);
  });
  it("diagnoses group deny fallthrough without rewriting the grant order", () => {
    const { note, notes } = noteContext();
    const module = materialize(
      note.version({
        modules: [notes],
        auth: ({ policy: p, platform, scopes }) =>
          p.initial({
            version: 1,
            bindings: p.bindings({}),
            grants: [
              p.allow({
                id: "admin",
                description: "admin",
                principal: p.anyone(),
                target: p.execute(platform.auth.setGrant),
              }),
              p.allow({
                id: "read",
                description: "read",
                principal: p.anyone(),
                target: p.read(scopes.global),
              }),
              p.deny({
                id: "blocked",
                description: "blocked",
                principal: p.group(authGroupId("blocked")),
                target: p.read(scopes.global),
              }),
            ],
          }),
      }),
    );
    expect(module.initialAuth.diagnostics.map((d) => d.code)).toEqual([
      "PH-AUTH-GROUP-DENY",
    ]);
    const policy = module.initialAuth.resolve({ deployment: {}, instance: {} });
    expect(
      evaluate(
        policy,
        { address: "alice" },
        { verb: "read", scope: "global" },
        {},
      ).decision,
    ).toBe("allow");
    expect(
      evaluate(
        policy,
        { address: "alice" },
        { verb: "read", scope: "global" },
        { blocked: { members: ["alice"] } },
      ).decision,
    ).toBe("deny");
  });
});
