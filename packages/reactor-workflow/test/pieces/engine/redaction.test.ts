// The journal side of redaction: what a run records versus what it passes on.
import { StaticConnectionResolver } from "../../src/engine/connections.js";
import { runWorkflow } from "../../src/engine/coordinator.js";
import { InMemorySecretProvider } from "../../src/engine/secrets.js";
import type {
  BlockExecution,
  BlockExecutor,
  WorkflowDefinition,
} from "../../src/engine/types.js";

const TOKEN = "ghp_9fA3kQ2xZ7rT1nP0bV6mL4sD8wJ5cH";

function edge(id: string, from: string, to: string, port = "next") {
  return { id, from, to, port };
}

// Stands in for a piece step that ran with a resolved connection: it reports
// the secret values it used, as ActivepiecesBlockExecutor does.
class CredentialedExecutor implements BlockExecutor {
  readonly seen: BlockExecution[] = [];

  constructor(
    private readonly outputs: Map<string, unknown>,
    private readonly failures: Map<string, Error> = new Map(),
  ) {}

  execute(execution: BlockExecution) {
    this.seen.push(execution);
    const failure = this.failures.get(execution.blockType);
    if (failure) return Promise.reject(failure);
    return Promise.resolve({
      output: this.outputs.get(execution.blockType),
      redactValues: [TOKEN],
    });
  }
}

// No trigger: a step with no inbound edge is an entry step, which is what
// makes these one- and two-step definitions runnable as written.
function definition(steps: WorkflowDefinition["steps"], edges = []) {
  return { steps, edges } as WorkflowDefinition;
}

describe("journaled step records", () => {
  it("redacts a known secret value from the output it journals", async () => {
    const executor = new CredentialedExecutor(
      new Map([
        ["piece#fetch", { access_token: TOKEN, note: `auth used ${TOKEN}` }],
      ]),
    );
    const result = await runWorkflow({
      definition: definition([
        { id: "s1", key: "fetch", blockType: "piece#fetch", config: {} },
      ]),
      executor,
    });

    expect(result.steps[0].output).toEqual({
      access_token: "[redacted:access_token]",
      note: "auth used [redacted:secret]",
    });
  });

  it("passes the live output to the next step regardless", async () => {
    const executor = new CredentialedExecutor(
      new Map<string, unknown>([
        ["piece#fetch", { token: TOKEN }],
        ["piece#use", { ok: true }],
      ]),
    );
    await runWorkflow({
      definition: definition(
        [
          { id: "s1", key: "fetch", blockType: "piece#fetch", config: {} },
          {
            id: "s2",
            key: "use",
            blockType: "piece#use",
            config: { header: "{{steps.fetch.output.token}}" },
          },
        ],
        [edge("e2", "s1", "s2")] as never,
      ),
      executor,
    });

    expect(executor.seen[1].config).toEqual({ header: TOKEN });
  });

  it("redacts the key-named credential in the input it journals", async () => {
    const executor = new CredentialedExecutor(
      new Map([["piece#fetch", { ok: true }]]),
    );
    const result = await runWorkflow({
      definition: definition([
        {
          id: "s1",
          key: "fetch",
          blockType: "piece#fetch",
          config: { url: "https://api.example.com", apiKey: "literal-key" },
        },
      ]),
      executor,
    });

    expect(result.steps[0].input).toEqual({
      url: "https://api.example.com",
      apiKey: "[redacted:apikey]",
    });
  });

  it("strips credentials from a failed step's message and the run error", async () => {
    const executor = new CredentialedExecutor(
      new Map(),
      new Map([
        [
          "piece#fail",
          new Error(
            "GET https://api.example.com/v1?api_key=abcd1234efgh failed: sent Bearer eyJhbGciOiJIUzI1NiJ9",
          ),
        ],
      ]),
    );
    const result = await runWorkflow({
      definition: definition([
        { id: "s1", key: "fetch", blockType: "piece#fail", config: {} },
      ]),
      executor,
    });

    expect(result.steps[0].error).toBe(
      "GET https://api.example.com/v1?api_key=[redacted:api_key] failed: sent Bearer [redacted:bearer]",
    );
    expect(result.error).toContain("[redacted:bearer]");
  });

  it("leaves an ordinary failure readable", async () => {
    const executor = new CredentialedExecutor(
      new Map(),
      new Map([["piece#fail", new Error("Request timed out after 30s")]]),
    );
    const result = await runWorkflow({
      definition: definition([
        { id: "s1", key: "fetch", blockType: "piece#fail", config: {} },
      ]),
      executor,
    });

    expect(result.steps[0].error).toBe("Request timed out after 30s");
    expect(result.error).toBe(
      'Step "fetch" failed: Request timed out after 30s',
    );
  });
});

describe("replaying a journaled output", () => {
  it("refuses a redacted output instead of replaying the marker", async () => {
    const executor = new CredentialedExecutor(
      new Map([["piece#use", { ok: true }]]),
    );
    const result = await runWorkflow({
      definition: definition(
        [
          { id: "s1", key: "fetch", blockType: "piece#fetch", config: {} },
          {
            id: "s2",
            key: "use",
            blockType: "piece#use",
            config: { header: "{{steps.fetch.output.access_token}}" },
          },
        ],
        [edge("e2", "s1", "s2")] as never,
      ),
      executor,
      completedSteps: new Map([
        ["s1", { output: { access_token: "[redacted:access_token]" } }],
      ]),
    });

    expect(result.status).toBe("FAILED");
    expect(result.steps[0].status).toBe("FAILED");
    expect(result.error).toContain("cannot be replayed");
    // The marker never reached the step that would have sent it upstream.
    expect(executor.seen).toHaveLength(0);
  });

  it("stops the rerun before another root step runs its side effects", async () => {
    const executor = new CredentialedExecutor(
      new Map([["piece#notify", { sent: true }]]),
    );
    const result = await runWorkflow({
      // Two roots, no trigger: nothing connects them, so the second is free
      // to run unless a refused replay ends the iteration outright.
      definition: definition([
        { id: "s1", key: "fetch", blockType: "piece#fetch", config: {} },
        { id: "s2", key: "notify", blockType: "piece#notify", config: {} },
      ]),
      executor,
      completedSteps: new Map([
        ["s1", { output: { access_token: "[redacted:access_token]" } }],
      ]),
    });

    expect(result.status).toBe("FAILED");
    expect(executor.seen).toHaveLength(0);
    expect(result.steps[1].status).toBe("SKIPPED");
  });

  it("replays an output that carries no marker", async () => {
    const executor = new CredentialedExecutor(
      new Map([["piece#use", { ok: true }]]),
    );
    const result = await runWorkflow({
      definition: definition(
        [
          { id: "s1", key: "fetch", blockType: "piece#fetch", config: {} },
          {
            id: "s2",
            key: "use",
            blockType: "piece#use",
            config: { header: "{{steps.fetch.output.id}}" },
          },
        ],
        [edge("e2", "s1", "s2")] as never,
      ),
      executor,
      completedSteps: new Map([["s1", { output: { id: "abc" } }]]),
    });

    expect(result.status).toBe("SUCCEEDED");
    expect(executor.seen[0].config).toEqual({ header: "abc" });
  });
});

describe("resolved connections", () => {
  it("reports the secrets behind a connection, not its config", async () => {
    const resolver = new StaticConnectionResolver(
      {
        gotify: {
          authType: "CUSTOM_AUTH",
          config: { base_url: "https://gotify.example" },
          secretRefs: [{ name: "app_token", ref: "vault://gotify-token" }],
        },
      },
      new InMemorySecretProvider({ "vault://gotify-token": TOKEN }),
    );

    await expect(resolver.resolveWithSecrets("gotify")).resolves.toEqual({
      auth: {
        type: "CUSTOM_AUTH",
        props: { base_url: "https://gotify.example", app_token: TOKEN },
      },
      secretValues: [TOKEN],
    });
  });
});
