// A piece feature the engine cannot run is refused where a user meets it: the
// listings flag it, describing a block throws, enabling parks, running fails.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as PieceCatalog from "./piece-catalog.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// The published catalog is remote; every fetch of it is refused here, so what
// a test sees is what the package pieces themselves produced.
vi.mock("./piece-catalog.js", async (importOriginal) => {
  const actual = await importOriginal<typeof PieceCatalog>();
  return {
    ...actual,
    fetchPieceCatalog: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceActions: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceTriggers: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchPieceDetail: vi.fn(() => Promise.reject(new Error("offline"))),
    fetchCatalogWithSuggestions: vi.fn(() =>
      Promise.reject(new Error("offline")),
    ),
  };
});

import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import {
  sourcedResolver,
  PieceWorker,
  PieceWorkerError,
  type PieceResolver,
} from "../pieces/index.js";
import { resetBlockSearchIndex } from "./block-search.js";
import { packagePieces } from "./piece-registry.js";
import { WorkflowRunStore } from "./store.js";
import { TriggerSupervisor } from "./trigger-supervisor.js";

const OAUTH = "@powerhousedao/piece-oauth-fixture";
const TRIGGERS = "@powerhousedao/piece-trigger-fixture";
const MULTI = "@powerhousedao/piece-multi-auth-fixture";
const ISSUES = "https://github.com/powerhouse-inc/powerhouse/issues";

// The shapes PieceAuth.OAuth2 and createTrigger build, as plain data.
const OAUTH_SOURCE = `
export const oauth = {
  displayName: "OAuth Fixture",
  auth: {
    type: "OAUTH2",
    displayName: "Connection",
    required: true,
    authUrl: "https://example.com/auth",
    tokenUrl: "https://example.com/token",
    scope: [],
  },
  actions: {
    echo: { name: "echo", displayName: "Echo", props: {}, run: async () => "ran" },
  },
  triggers: {},
};
`;

// OAuth2 or a token: the token runs, and it is the one validate sees.
const MULTI_SOURCE = `
export const multi = {
  displayName: "Multi Auth Fixture",
  auth: [
    {
      type: "OAUTH2",
      displayName: "Connection",
      required: true,
      authUrl: "https://example.com/auth",
      tokenUrl: "https://example.com/token",
      scope: [],
    },
    {
      type: "CUSTOM_AUTH",
      displayName: "Token",
      required: true,
      props: {
        token: { type: "SECRET_TEXT", displayName: "Token", required: true },
      },
      validate: async ({ auth }) =>
        auth.token === "good" ? { valid: true } : { valid: false, error: "bad token" },
    },
  ],
  actions: {
    whoami: {
      name: "whoami",
      displayName: "Who am I",
      requireAuth: true,
      props: {},
      run: async (ctx) => ctx.auth.type + ":" + ctx.auth.props.token,
    },
  },
  triggers: {},
};
`;

const TRIGGER_SOURCE = `
const none = { strategy: "NONE" };
export const triggers = {
  displayName: "Trigger Fixture",
  actions: {
    ok: { name: "ok", displayName: "Ok", props: {}, run: async () => "ran" },
  },
  triggers: {
    plain: {
      name: "plain",
      displayName: "Plain",
      type: "POLLING",
      renewConfiguration: none,
      props: {},
      onEnable: async () => undefined,
      run: async () => [],
    },
    manual: {
      name: "manual",
      displayName: "Manual",
      type: "MANUAL",
      renewConfiguration: none,
      props: {},
      run: async () => [{ fired: true }],
    },
    renewing: {
      name: "renewing",
      displayName: "Renewing",
      type: "WEBHOOK",
      renewConfiguration: { strategy: "CRON", cronExpression: "0 */12 * * *" },
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      onRenew: async () => undefined,
      run: async (ctx) => [ctx.payload],
    },
    badRenew: {
      name: "badRenew",
      displayName: "Bad Renew",
      type: "WEBHOOK",
      renewConfiguration: { strategy: "CRON", cronExpression: "not a cron" },
      props: {},
      onEnable: async () => undefined,
      onDisable: async () => undefined,
      onRenew: async () => undefined,
      run: async (ctx) => [ctx.payload],
    },
  },
};
`;

const OAUTH_REASON = `OAuth2 auth is not supported yet (${ISSUES}/3091)`;
const MANUAL_REASON = `TriggerStrategy.MANUAL is not supported yet (${ISSUES}/3091)`;
const RENEW_REASON = `renewConfiguration cron "not a cron" is invalid (${ISSUES}/3090)`;

let root = "";
const entry = (name: string) => join(root, `${name}.mjs`);

describe("unsupported piece features", () => {
  const runtime = testRuntime();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "unsupported-features-"));
    await writeFile(entry("oauth"), OAUTH_SOURCE);
    await writeFile(entry("triggers"), TRIGGER_SOURCE);
    await writeFile(entry("multi"), MULTI_SOURCE);
    packagePieces.setPieces([
      { name: OAUTH, version: "1.0.0", entryPath: entry("oauth") },
      { name: TRIGGERS, version: "1.0.0", entryPath: entry("triggers") },
      { name: MULTI, version: "1.0.0", entryPath: entry("multi") },
    ]);
  });

  afterAll(async () => {
    packagePieces.reset();
    resetBlockSearchIndex();
    runtime.shutdown();
    await rm(root, { recursive: true, force: true });
  });

  describe("in the listings", () => {
    it("lists an OAuth2 piece with the reason none of its blocks can run", async () => {
      const catalog = await runtime.pieceCatalog();
      expect(catalog.find((piece) => piece.name === OAUTH)?.unsupported).toBe(
        `OAuth2 auth is not supported yet (${ISSUES}/3091)`,
      );
      expect(
        catalog.find((piece) => piece.name === TRIGGERS)?.unsupported,
      ).toBeUndefined();
      const { actions } = await runtime.pieceActions(OAUTH);
      expect(actions.map((action) => action.unsupported)).toEqual([
        OAUTH_REASON,
      ]);
    });

    it("flags a MANUAL trigger or a malformed renewal, not their siblings", async () => {
      const { triggers } = await runtime.pieceTriggers(TRIGGERS);
      expect(
        Object.fromEntries(triggers.map((t) => [t.name, t.unsupported])),
      ).toEqual({
        plain: undefined,
        manual: MANUAL_REASON,
        renewing: undefined,
        badRenew: RENEW_REASON,
      });
    });

    it("flags the same blocks in search", async () => {
      const { hits } = await runtime.searchBlocks("fixture", 20);
      expect(
        Object.fromEntries(
          hits.map((hit) => [`${hit.pieceName} ${hit.name}`, hit.unsupported]),
        ),
      ).toEqual({
        [`${OAUTH} echo`]: OAUTH_REASON,
        [`${TRIGGERS} ok`]: undefined,
        [`${TRIGGERS} plain`]: undefined,
        [`${TRIGGERS} manual`]: MANUAL_REASON,
        [`${TRIGGERS} renewing`]: undefined,
        [`${TRIGGERS} badRenew`]: RENEW_REASON,
        [`${MULTI} whoami`]: undefined,
      });
    });
  });

  describe("a piece with several sign-in methods", () => {
    it("is listed as runnable when one of its methods runs", async () => {
      const catalog = await runtime.pieceCatalog();
      expect(
        catalog.find((piece) => piece.name === MULTI)?.unsupported,
      ).toBeUndefined();
    });

    it("describes each method, and which of them can't run", async () => {
      const described = (await runtime.blockDescriptor({
        pieceName: MULTI,
        pieceVersion: "1.0.0",
        kind: "action" as const,
        name: "whoami",
      })) as {
        auth: { type: string; unsupported?: string }[];
      };
      expect(
        described.auth.map((method) => [method.type, method.unsupported]),
      ).toEqual([
        ["OAUTH2", OAUTH_REASON],
        ["CUSTOM_AUTH", undefined],
      ]);
    });
  });

  describe("describing a block", () => {
    it("refuses every block of an OAuth2 piece", async () => {
      await expect(
        runtime.blockDescriptor({
          pieceName: OAUTH,
          pieceVersion: "1.0.0",
          kind: "action" as const,
          name: "echo",
        }),
      ).rejects.toThrow(`Piece "${OAUTH}": ${OAUTH_REASON}`);
    });

    it("refuses a MANUAL trigger or a malformed renewal and describes the rest", async () => {
      await expect(
        runtime.blockDescriptor({
          pieceName: TRIGGERS,
          pieceVersion: "1.0.0",
          kind: "trigger" as const,
          name: "manual",
        }),
      ).rejects.toThrow(`Trigger "manual" of "${TRIGGERS}": ${MANUAL_REASON}`);
      await expect(
        runtime.blockDescriptor({
          pieceName: TRIGGERS,
          pieceVersion: "1.0.0",
          kind: "trigger" as const,
          name: "badRenew",
        }),
      ).rejects.toThrow(RENEW_REASON);
      await expect(
        runtime.blockDescriptor({
          pieceName: TRIGGERS,
          pieceVersion: "1.0.0",
          kind: "trigger" as const,
          name: "renewing",
        }),
      ).resolves.toMatchObject({
        trigger: {
          name: "renewing",
          renew: { strategy: "CRON", cronExpression: "0 */12 * * *" },
        },
      });
      await expect(
        runtime.blockDescriptor({
          pieceName: TRIGGERS,
          pieceVersion: "1.0.0",
          kind: "trigger" as const,
          name: "plain",
        }),
      ).resolves.toMatchObject({ trigger: { name: "plain" } });
      await expect(
        runtime.blockDescriptor({
          pieceName: TRIGGERS,
          pieceVersion: "1.0.0",
          kind: "action" as const,
          name: "ok",
        }),
      ).resolves.toMatchObject({ action: { name: "ok" } });
    });
  });

  describe("enabling a trigger", () => {
    it("parks it with the reason, and never retries", async () => {
      const store = await WorkflowRunStore.create(createTestRelationalDb());
      const nowhere: PieceResolver = {
        resolve: () => Promise.reject(new Error("not a package piece")),
      };
      const supervisor = new TriggerSupervisor({
        store: () => Promise.resolve(store),
        resolveAuth: () => Promise.resolve(undefined),
        fire: () => undefined,
        cacheDir: root,
        // Every binding here names an installed piece.
        resolver: {
          resolve: (target) =>
            sourcedResolver({ cacheDir: root, lookup: packagePieces.lookup })
              .resolve({ ...target, source: "local" })
              .catch(() => nowhere.resolve(target)),
        },
        webhookUrlFor: () => Promise.resolve("https://example.com/hook"),
      });
      try {
        for (const name of ["manual", "badRenew"]) {
          await supervisor.upsert({
            workflowId: `wf-${name}`,
            block: {
              pieceName: TRIGGERS,
              pieceVersion: "1.0.0",
              kind: "trigger" as const,
              name,
            },
            packageName: TRIGGERS,
            version: "1.0.0",
            triggerName: name,
            config: {},
            connectionId: null,
          });
        }
        const manual = await store.getTriggerState("wf-manual");
        expect(manual?.status).toBe("ERROR");
        expect(manual?.last_error).toBe(
          `Trigger "manual" of "${TRIGGERS}": ${MANUAL_REASON}`,
        );
        expect(manual?.next_poll_at).toBeNull();
        const badRenew = await store.getTriggerState("wf-badRenew");
        expect(badRenew?.last_error).toContain(RENEW_REASON);
        expect(badRenew?.next_poll_at).toBeNull();
        expect(badRenew?.next_renew_at).toBeNull();
      } finally {
        supervisor.stop();
      }
    }, 60_000);
  });

  describe("running", () => {
    const worker = new PieceWorker();
    afterAll(() => worker.dispose());

    it("fails a step of an OAuth2 piece before piece code runs", async () => {
      const error = await worker
        .runAction({
          entryPath: entry("oauth"),
          actionName: "echo",
          propsValue: {},
        })
        .catch((thrown: unknown) => thrown);
      expect(error).toBeInstanceOf(PieceWorkerError);
      expect((error as PieceWorkerError).serialized.unsupportedFeature).toBe(
        "OAuth2 auth",
      );
      expect((error as PieceWorkerError).message).toContain(OAUTH_REASON);
    });

    it("runs a multi-auth piece through the connection's own method", async () => {
      const run = (auth: unknown) =>
        worker.runAction({
          entryPath: entry("multi"),
          actionName: "whoami",
          propsValue: {},
          auth,
        });
      await expect(
        run({ type: "CUSTOM_AUTH", props: { token: "good" } }),
      ).resolves.toMatchObject({ output: "CUSTOM_AUTH:good" });
      await expect(run({ type: "OAUTH2", access_token: "t" })).rejects.toThrow(
        OAUTH_REASON,
      );
      await expect(
        run({ type: "BASIC_AUTH", username: "u", password: "p" }),
      ).rejects.toThrow("has no BASIC_AUTH sign-in method");
    });

    it("checks a multi-auth connection with its method's validate", async () => {
      const check = (token: string) =>
        worker.checkConnection({
          entryPath: entry("multi"),
          auth: { type: "CUSTOM_AUTH", props: { token } },
        });
      await expect(check("good")).resolves.toMatchObject({
        output: { declared: true, valid: true },
      });
      await expect(check("nope")).resolves.toMatchObject({
        output: { declared: true, valid: false, detail: "bad token" },
      });
    });

    it("refuses a MANUAL or malformed-renewal trigger's hooks but still tears one down", async () => {
      const hook = (name: "run" | "onDisable", triggerName: string) =>
        worker.runTriggerHook({
          entryPath: entry("triggers"),
          triggerName,
          hook: name,
          propsValue: {},
          storeState: {},
        });
      await expect(hook("run", "manual")).rejects.toThrow(MANUAL_REASON);
      await expect(hook("run", "badRenew")).rejects.toThrow(RENEW_REASON);
      await expect(hook("onDisable", "badRenew")).resolves.toBeDefined();
    });
  });
});
