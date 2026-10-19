import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitHostJsonSchema, validateHost } from "@powerhousedao/host-core";
import type { PHHost, PHHostOutputs } from "@powerhousedao/host-core";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as clintRunner from "../src/runners/clint-runner.js";
import * as mastraRunner from "../src/runners/mastra-runner.js";

/** The runner modules as validateHost sees them (spread: the index-signature
 * shape of RunnerModule, no cast). */
const MASTRA = "@powerhousedao/clint/mastra-runner";
const CLINT = "@powerhousedao/clint/clint-runner";
const mastra = { ...mastraRunner };
const clint = { ...clintRunner };

/** The scaffold/Sektar assistant host, with a literal model. The
 * `satisfies PHHost` is the type-level half of the contract. */
const assistantHost = () =>
  ({
    name: "assistant",
    runner: { module: MASTRA, port: 4910, workdir: "${userData}/assistant" },
    profile: { appId: "inc.powerhouse.assistant.lab", name: "Lab Assistant" },
    reactor: {
      backends: {
        switchboard: { kind: "remote", remote: { host: "switchboard" } },
      },
      protocol: {},
    },
    config: {
      model: "openrouter/anthropic/claude-sonnet-4.5",
      instructions: "You are the lab assistant.",
      prompts: { skillsDir: "agents", outDir: "dist/skills" },
    },
  }) satisfies PHHost;

/** A clint shell host using every option the runner reads. */
const cliHost = () =>
  ({
    name: "cli",
    runner: {
      module: CLINT,
      lifecycle: "attached",
      proxy: {
        port: 8490,
        routes: {
          "/agent": { member: "assistant", path: "/v1", ws: false },
          "/docs": { upstream: "https://docs.example.com" },
        },
      },
    },
    children: {
      switchboard: { host: "switchboard" },
      assistant: {
        host: "assistant",
        config: { readiness: { pattern: "agent API", timeout: 60_000 } },
      },
    },
    config: {
      agents: {
        main: { host: "assistant" },
        remote: { url: "https://agents.example.com/v1" },
      },
      startOrder: ["switchboard", "assistant"],
    },
  }) satisfies PHHost;

const validate = {
  mastra: (host: unknown) =>
    validateHost(mastra, MASTRA, host, "hosts/assistant/host.js"),
  clint: (host: unknown) =>
    validateHost(clint, CLINT, host, "hosts/cli/host.js"),
};

describe("mastra-runner host contract", () => {
  it("accepts the scaffold assistant host", () => {
    expect(validate.mastra(assistantHost()).config?.model).toBe(
      "openrouter/anthropic/claude-sonnet-4.5",
    );
  });

  it("rejects an unknown runner key", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({ ...host, runner: { ...host.runner, workDir: "x" } }),
    ).toThrow(/runner: Unrecognized key: "workDir"/);
  });

  it("rejects a defaultVerb typo", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({
        ...host,
        runner: { ...host.runner, defaultVerb: "serv" },
      }),
    ).toThrow(/defaultVerb "serv" is not a verb/);
  });

  it("rejects unknown config and top-level keys", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({ ...host, config: { ...host.config, modle: "x" } }),
    ).toThrow(/config: Unrecognized key: "modle"/);
    expect(() =>
      validate.mastra({
        ...host,
        config: { ...host.config, prompts: { skillDir: "a" } },
      }),
    ).toThrow(/config\.prompts: Unrecognized key: "skillDir"/);
    expect(() => validate.mastra({ ...host, reactr: {} })).toThrow(
      /Unrecognized key: "reactr"/,
    );
  });

  it("keeps the base reactor block, remote.host included (removed in T3)", () => {
    const host = assistantHost();
    expect(
      validate.mastra(host).reactor?.backends?.switchboard?.remote?.host,
    ).toBe("switchboard");
  });

  it("outputsSchema is strict and URL-typed", () => {
    const outputs = {
      origin: "http://127.0.0.1:4910",
      endpoints: {
        openai: "http://127.0.0.1:4910/v1",
        ready: "http://127.0.0.1:4910/ready",
      },
    };
    expect(mastraRunner.outputsSchema.parse(outputs)).toEqual(outputs);
    expect(
      mastraRunner.outputsSchema.safeParse({ ...outputs, port: 4910 }).success,
    ).toBe(false);
    expect(
      mastraRunner.outputsSchema.safeParse({ ...outputs, origin: "4910" })
        .success,
    ).toBe(false);
  });
});

describe("clint-runner host contract", () => {
  it("accepts a host using every option the runner reads", () => {
    const parsed = validate.clint(cliHost());
    expect(parsed.runner.lifecycle).toBe("attached");
    expect(parsed.children.assistant?.config?.readiness?.timeout).toBe(60_000);
  });

  it("rejects an unknown runner key", () => {
    const host = cliHost();
    expect(() =>
      validate.clint({ ...host, runner: { ...host.runner, lifecycel: "x" } }),
    ).toThrow(/runner: Unrecognized key: "lifecycel"/);
  });

  it("rejects a defaultVerb typo", () => {
    const host = cliHost();
    expect(() =>
      validate.clint({
        ...host,
        runner: { ...host.runner, defaultVerb: "dvev" },
      }),
    ).toThrow(/defaultVerb "dvev" is not a verb/);
  });

  it("applies the startOrder refinement", () => {
    const host = cliHost();
    expect(() =>
      validate.clint({
        ...host,
        config: { ...host.config, startOrder: ["switchboard", "asistant"] },
      }),
    ).toThrow(/config\.startOrder\.1: startOrder names "asistant"/);
  });

  it("rejects an invalid lifecycle, proxy route, agent or member config", () => {
    const host = cliHost();
    expect(() =>
      validate.clint({
        ...host,
        runner: { ...host.runner, lifecycle: "forever" },
      }),
    ).toThrow(/runner\.lifecycle/);
    expect(() =>
      validate.clint({
        ...host,
        runner: {
          ...host.runner,
          proxy: { port: 8490, routes: { "/x": { ws: true } } },
        },
      }),
    ).toThrow(/runner\.proxy\.routes\.\/x: a proxy route names a `member`/);
    expect(() =>
      validate.clint({
        ...host,
        config: { agents: { main: {} } },
      }),
    ).toThrow(/config\.agents\.main: an agents entry needs/);
    expect(() =>
      validate.clint({
        ...host,
        children: {
          ...host.children,
          assistant: { host: "assistant", config: { readyness: {} } },
        },
      }),
    ).toThrow(/children\.assistant\.config: Unrecognized key: "readyness"/);
  });

  it("outputsSchema carries the agents and the optional proxy url", () => {
    expect(
      clintRunner.outputsSchema.parse({
        agents: { main: "http://127.0.0.1:4910/v1" },
        proxy: { url: "http://0.0.0.0:8490" },
      }).proxy?.url,
    ).toBe("http://0.0.0.0:8490");
    expect(
      clintRunner.outputsSchema.safeParse({ agents: { main: "nope" } }).success,
    ).toBe(false);
  });
});

describe("PHHostRunners augmentation", () => {
  it("types host files by runner.module", () => {
    const typo = {
      name: "assistant",
      // @ts-expect-error -- `workDir` is not a mastra-runner option
      runner: { module: MASTRA, workDir: "x" },
    } satisfies PHHost;
    expect(typo.name).toBe("assistant");

    expectTypeOf<
      PHHostOutputs<typeof MASTRA>
    >().toEqualTypeOf<mastraRunner.MastraOutputs>();
    expectTypeOf<
      PHHostOutputs<typeof CLINT>
    >().toEqualTypeOf<clintRunner.ClintOutputs>();
  });
});

const schemasDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);

/** Committed artifacts must match the live schemas. Fix a failure with:
 * pnpm --filter @powerhousedao/clint emit-schemas */
describe("emitted runner host schemas drift", () => {
  const emitted = {
    "host-mastra-runner.schema.json": emitHostJsonSchema(
      "host-mastra-runner",
      mastraRunner.hostSchema,
    ),
    "host-clint-runner.schema.json": emitHostJsonSchema(
      "host-clint-runner",
      clintRunner.hostSchema,
    ),
  };
  for (const [file, schema] of Object.entries(emitted)) {
    it(`schemas/${file} is current`, () => {
      const committed = JSON.parse(
        readFileSync(path.join(schemasDir, file), "utf8"),
      ) as unknown;
      expect(committed).toEqual(schema);
    });
  }
});
