import {
  BoundConnectionResolver,
  ConnectionNotBoundError,
  ConnectionNotFoundError,
  declaredConnectionIds,
  StaticConnectionResolver,
  UnsupportedAuthTypeError,
  type ConnectionRequest,
  type EngineConnectionResolver,
} from "../../../src/pieces/engine/connections.js";
import {
  InMemorySecretProvider,
  SecretNotFoundError,
} from "../../../src/pieces/engine/secrets.js";
import type { WorkflowDefinition } from "../../../src/pieces/engine/types.js";

describe("connection resolution", () => {
  const secrets = new InMemorySecretProvider({
    "vault://gotify-token": "tok-123",
    "vault://api-key": "key-456",
    "vault://pass": "hunter2",
  });

  it("shapes CUSTOM_AUTH as an AppConnectionValue with merged props", async () => {
    const resolver = new StaticConnectionResolver(
      {
        gotify: {
          authType: "CUSTOM_AUTH",
          config: { base_url: "https://gotify.example" },
          secretRefs: [{ name: "app_token", ref: "vault://gotify-token" }],
        },
      },
      secrets,
    );

    await expect(resolver.resolve("gotify")).resolves.toEqual({
      type: "CUSTOM_AUTH",
      props: { base_url: "https://gotify.example", app_token: "tok-123" },
    });
  });

  it("shapes SECRET_TEXT as an AppConnectionValue", async () => {
    const resolver = new StaticConnectionResolver(
      {
        api: {
          authType: "SECRET_TEXT",
          secretRefs: [{ name: "token", ref: "vault://api-key" }],
        },
      },
      secrets,
    );
    await expect(resolver.resolve("api")).resolves.toEqual({
      type: "SECRET_TEXT",
      secret_text: "key-456",
    });
  });

  it("shapes BASIC_AUTH from config plus secrets", async () => {
    const resolver = new StaticConnectionResolver(
      {
        basic: {
          authType: "BASIC_AUTH",
          config: { username: "ada" },
          secretRefs: [{ name: "password", ref: "vault://pass" }],
        },
      },
      secrets,
    );
    await expect(resolver.resolve("basic")).resolves.toEqual({
      type: "BASIC_AUTH",
      username: "ada",
      password: "hunter2",
    });
  });

  it("resolves NONE to undefined and rejects unknowns", async () => {
    const resolver = new StaticConnectionResolver(
      {
        open: { authType: "NONE" },
        oauth: { authType: "OAUTH2" },
        broken: {
          authType: "SECRET_TEXT",
          secretRefs: [{ name: "token", ref: "vault://missing" }],
        },
      },
      secrets,
    );
    await expect(resolver.resolve("open")).resolves.toBeUndefined();
    await expect(resolver.resolve("nope")).rejects.toBeInstanceOf(
      ConnectionNotFoundError,
    );
    await expect(resolver.resolve("oauth")).rejects.toBeInstanceOf(
      UnsupportedAuthTypeError,
    );
    await expect(resolver.resolve("broken")).rejects.toBeInstanceOf(
      SecretNotFoundError,
    );
  });
});

describe("connection binding", () => {
  const definition: WorkflowDefinition = {
    trigger: {
      id: "t",
      blockType: "@acme/piece-imap@1.0.0#trigger:new_email",
      connectionId: "conn-imap",
    },
    steps: [
      {
        id: "s1",
        key: "notify",
        blockType: "@acme/piece-slack@1.0.0#send",
        connectionId: "conn-slack",
        config: {},
      },
      {
        id: "s2",
        key: "picked",
        blockType: "@acme/piece-slack@1.0.0#send",
        connectionId: "{{trigger.payload.connectionId}}",
        config: {},
      },
      { id: "s3", key: "plain", blockType: "core#branch", config: {} },
    ],
    edges: [],
  };

  class RecordingResolver implements EngineConnectionResolver {
    readonly calls: [string, ConnectionRequest | undefined][] = [];

    resolve(connectionId: string, request?: ConnectionRequest) {
      this.calls.push([connectionId, request]);
      return Promise.resolve({ type: "SECRET_TEXT", secret_text: "s3cret" });
    }
  }

  // What a host resolver looks like: the concrete secrets come back with the
  // auth, rather than being guessed from it afterwards.
  class SecretBearingResolver extends RecordingResolver {
    async resolveWithSecrets(
      connectionId: string,
      request?: ConnectionRequest,
    ) {
      return {
        auth: await this.resolve(connectionId, request),
        secretValues: ["s3cret"],
      };
    }
  }

  const bindingOf = () => declaredConnectionIds(definition);

  it("declares the trigger's and every step's connection, never a templated one", () => {
    expect([...declaredConnectionIds(definition)]).toEqual([
      "conn-imap",
      "conn-slack",
    ]);
  });

  it("resolves a declared connection and forwards the asking step", async () => {
    const inner = new RecordingResolver();
    const bound = new BoundConnectionResolver(inner, bindingOf);
    await expect(
      bound.resolve("conn-slack", {
        blockType: "@acme/piece-slack@1.0.0#send",
        stepId: "s1",
        stepKey: "notify",
      }),
    ).resolves.toEqual({ type: "SECRET_TEXT", secret_text: "s3cret" });
    expect(inner.calls[0][1]?.stepKey).toBe("notify");
  });

  it("keeps resolving the trigger's own connection", async () => {
    const inner = new RecordingResolver();
    const bound = new BoundConnectionResolver(inner, bindingOf);
    await expect(
      bound.resolve("conn-imap", {
        blockType: "@acme/piece-imap@1.0.0#trigger:new_email",
      }),
    ).resolves.toBeDefined();
  });

  it("refuses an undeclared connection without reaching the resolver", async () => {
    const inner = new RecordingResolver();
    const refused: string[] = [];
    const bound = new BoundConnectionResolver(inner, bindingOf, (id) =>
      refused.push(id),
    );
    await expect(
      bound.resolve("conn-someone-elses", {
        blockType: "@acme/piece-slack@1.0.0#send",
      }),
    ).rejects.toBeInstanceOf(ConnectionNotBoundError);
    expect(inner.calls).toEqual([]);
    expect(refused).toEqual(["conn-someone-elses"]);
  });

  it("refuses a connection named by an expression", async () => {
    const inner = new RecordingResolver();
    const bound = new BoundConnectionResolver(inner, bindingOf);
    await expect(
      bound.resolve("{{trigger.payload.connectionId}}", {
        blockType: "@acme/piece-slack@1.0.0#send",
      }),
    ).rejects.toBeInstanceOf(ConnectionNotBoundError);
  });

  it("resolves nothing at all when no binding is in force", async () => {
    const inner = new RecordingResolver();
    const bound = new BoundConnectionResolver(inner, () => undefined);
    await expect(bound.resolve("conn-slack")).rejects.toBeInstanceOf(
      ConnectionNotBoundError,
    );
    expect(inner.calls).toEqual([]);
  });

  // Dropping this on the way through is silent: the caller falls back to
  // guessing which values to redact out of the journal.
  it("carries the inner resolver's secret-bearing path through the binding", async () => {
    const inner = new SecretBearingResolver();
    const bound = new BoundConnectionResolver(inner, bindingOf);

    await expect(
      bound.resolveWithSecrets?.("conn-slack", {
        blockType: "@acme/piece-slack@1.0.0#send",
      }),
    ).resolves.toEqual({
      auth: { type: "SECRET_TEXT", secret_text: "s3cret" },
      secretValues: ["s3cret"],
    });
  });

  it("asks the same question on the secret-bearing path", async () => {
    const inner = new SecretBearingResolver();
    const refused: string[] = [];
    const bound = new BoundConnectionResolver(inner, bindingOf, (id) =>
      refused.push(id),
    );

    await expect(
      bound.resolveWithSecrets?.("conn-someone-elses", {
        blockType: "@acme/piece-slack@1.0.0#send",
      }),
    ).rejects.toBeInstanceOf(ConnectionNotBoundError);
    expect(inner.calls).toEqual([]);
    expect(refused).toEqual(["conn-someone-elses"]);
  });

  // An inner resolver without the path must not appear to have one.
  it("offers no secret-bearing path when the inner resolver has none", () => {
    const bound = new BoundConnectionResolver(
      new RecordingResolver(),
      bindingOf,
    );

    expect(bound.resolveWithSecrets).toBeUndefined();
  });
});
