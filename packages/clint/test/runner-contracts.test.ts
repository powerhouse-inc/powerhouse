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

/** The scaffold/Sektar assistant host as DECLARED: a literal model and the
 * key as an `$env` token. The `satisfies PHHost` is the type-level half of
 * the contract. (`remote.url` takes the switchboard endpoint token once
 * host-core makes it a ref() field; spelled literally here.) */
const declaredAssistantHost = () =>
  ({
    name: "assistant",
    runner: { module: MASTRA, port: 4910 },
    profile: { appId: "inc.powerhouse.assistant.lab", name: "Lab Assistant" },
    reactor: {
      backends: {
        switchboard: {
          kind: "remote",
          remote: { url: "http://127.0.0.1:4001/graphql" },
        },
      },
      protocol: {},
    },
    config: {
      model: "openrouter/anthropic/claude-sonnet-4.5",
      apiKey: { $env: "OPENROUTER_API_KEY" },
      instructions: "You are the lab assistant.",
      prompts: { skillsDir: "agents", outDir: "dist/skills" },
    },
  }) satisfies PHHost;

/** The same host RESOLVED: what the verbs receive. */
const assistantHost = () => {
  const host = declaredAssistantHost();
  return { ...host, config: { ...host.config, apiKey: "sk-or-test" } };
};

/** A clint shell host using every option the runner reads, as DECLARED:
 * the assistant agent and the proxy route name the assistant host's outputs
 * by token. */
const declaredCliHost = () =>
  ({
    name: "cli",
    runner: {
      module: CLINT,
      lifecycle: "attached",
      proxy: {
        port: 8490,
        routes: {
          "/agent": {
            upstream: { $output: { host: "assistant", path: ["origin"] } },
            path: "/v1",
            ws: false,
          },
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
        main: {
          url: {
            $output: { host: "assistant", path: ["endpoints", "openai"] },
          },
        },
        remote: { url: "https://agents.example.com/v1" },
      },
      startOrder: ["switchboard", "assistant"],
    },
  }) satisfies PHHost;

/** The same host RESOLVED: what the verbs receive. */
const cliHost = () => {
  const host = declaredCliHost();
  return {
    ...host,
    runner: {
      ...host.runner,
      proxy: {
        ...host.runner.proxy,
        routes: {
          ...host.runner.proxy.routes,
          "/agent": { upstream: "http://127.0.0.1:4910", path: "/v1" },
        },
      },
    },
    config: {
      ...host.config,
      agents: {
        ...host.config.agents,
        main: { url: "http://127.0.0.1:4910/v1" },
      },
    },
  };
};

const validate = {
  mastra: (host: unknown) =>
    validateHost(mastra, MASTRA, host, "hosts/assistant/host.js"),
  clint: (host: unknown) =>
    validateHost(clint, CLINT, host, "hosts/cli/host.js"),
};

describe("mastra-runner host contract", () => {
  it("accepts the scaffold assistant host", () => {
    const parsed = validate.mastra(assistantHost());
    expect(parsed.config?.model).toBe("openrouter/anthropic/claude-sonnet-4.5");
    expect(parsed.config?.apiKey).toBe("sk-or-test");
  });

  it("declared form: apiKey takes an $env or $output token", () => {
    const host = declaredAssistantHost();
    expect(mastraRunner.declaredHostSchema.safeParse(host).success).toBe(true);
    expect(
      mastraRunner.declaredHostSchema.safeParse({
        ...host,
        config: {
          ...host.config,
          apiKey: { $output: { host: "vault", path: ["keys", "openrouter"] } },
        },
      }).success,
    ).toBe(true);
  });

  it("resolved form: apiKey is a string, tokens are rejected", () => {
    const result = mastraRunner.hostSchema.safeParse(declaredAssistantHost());
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path)).toEqual([
      ["config", "apiKey"],
    ]);
  });

  it("rejects an unknown runner key, including the retired workdir", () => {
    const host = assistantHost();
    expect(() =>
      validate.mastra({ ...host, runner: { ...host.runner, workDir: "x" } }),
    ).toThrow(/runner: Unrecognized key: "workDir"/);
    expect(() =>
      validate.mastra({
        ...host,
        runner: { ...host.runner, workdir: "${userData}/assistant" },
      }),
    ).toThrow(/runner: Unrecognized key: "workdir"/);
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
    expect(parsed.config?.agents?.main?.url).toBe("http://127.0.0.1:4910/v1");
  });

  it("declared form: agent urls and proxy upstreams take output tokens", () => {
    expect(clintRunner.declaredHostSchema.safeParse(declaredCliHost())).toEqual(
      expect.objectContaining({ success: true }),
    );
  });

  it("resolved form: agents and proxy upstreams are deferred self fields that keep their tokens", () => {
    // They name the compound's own members' outputs, which exist only after
    // the verb starts them; clint resolves them then (resolveOwnFields).
    const parsed = clintRunner.hostSchema.parse(declaredCliHost());
    expect(parsed.config?.agents?.main?.url).toEqual({
      $output: { host: "assistant", path: ["endpoints", "openai"] },
    });
    expect(parsed.runner.proxy?.routes["/agent"]?.upstream).toEqual({
      $output: { host: "assistant", path: ["origin"] },
    });
  });

  it("rejects the removed agents.<x>.host and proxy member forms naming the token form", () => {
    const host = cliHost();
    for (const schema of [
      clintRunner.hostSchema,
      clintRunner.declaredHostSchema,
    ]) {
      const agent = schema.safeParse({
        ...host,
        config: { agents: { main: { host: "assistant" } } },
      });
      expect(agent.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ["config", "agents", "main"],
          message: expect.stringMatching(
            /`host` was removed; use url: <host>\.endpoints\.openai from \.\.\/<host>\/outputs\.js, or \{ url: \{ \$output: \{ host: "assistant", path: \["endpoints", "openai"\] \} \} \}/,
          ) as unknown,
        }),
      );
      const route = schema.safeParse({
        ...host,
        runner: {
          ...host.runner,
          proxy: { port: 8490, routes: { "/x": { member: "assistant" } } },
        },
      });
      expect(route.error?.issues).toContainEqual(
        expect.objectContaining({
          path: ["runner", "proxy", "routes", "/x"],
          message: expect.stringMatching(
            /`member` was removed; point `upstream` at the member host's output/,
          ) as unknown,
        }),
      );
    }
    // Through validateHost the message carries the field path.
    expect(() =>
      validate.clint({
        ...host,
        config: { agents: { main: { host: "assistant" } } },
      }),
    ).toThrow(/config\.agents\.main: `host` was removed; use url:/);
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
    ).toThrow(/runner\.proxy\.routes\.\/x\.upstream: Invalid input/);
    expect(() =>
      validate.clint({
        ...host,
        config: { agents: { main: {} } },
      }),
    ).toThrow(/config\.agents\.main\.url: Invalid input/);
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

describe("declared verbs", () => {
  const functions = (mod: Record<string, unknown>) =>
    Object.entries(mod)
      .filter(([, value]) => typeof value === "function")
      .map(([name]) => name);

  it("mastra lists exactly its verb functions (not promptFromMessages)", () => {
    expect([...mastraRunner.verbs].sort()).toEqual(
      functions(mastra)
        .filter((name) => name !== "promptFromMessages")
        .sort(),
    );
  });

  it("clint lists exactly its verb functions", () => {
    expect([...clintRunner.verbs].sort()).toEqual(functions(clint).sort());
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

    // Authors may write the key as a token; verbs only ever see a string.
    type DeclaredKey = NonNullable<
      NonNullable<mastraRunner.MastraHostInput["config"]>["apiKey"]
    >;
    expectTypeOf<{ $env: "OPENROUTER_API_KEY" }>().toExtend<DeclaredKey>();
    expectTypeOf<
      NonNullable<mastraRunner.MastraHost["config"]>["apiKey"]
    >().toEqualTypeOf<string | undefined>();
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

/** Committed artifacts must match the live schemas. They are the DECLARED
 * forms (what authors write: token-able fields accept tokens). Fix a
 * failure with: pnpm --filter @powerhousedao/clint emit-schemas */
describe("emitted runner host schemas drift", () => {
  const emitted = {
    "host-mastra-runner.schema.json": emitHostJsonSchema(
      "host-mastra-runner",
      mastraRunner.declaredHostSchema,
    ),
    "host-clint-runner.schema.json": emitHostJsonSchema(
      "host-clint-runner",
      clintRunner.declaredHostSchema,
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
