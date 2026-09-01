import {
  ConnectionNotFoundError,
  InMemorySecretProvider,
  SecretNotFoundError,
  StaticConnectionResolver,
  UnsupportedAuthTypeError,
} from "../../src/engine/connections.js";

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

  it("shapes SECRET_TEXT as the bare secret value", async () => {
    const resolver = new StaticConnectionResolver(
      {
        api: {
          authType: "SECRET_TEXT",
          secretRefs: [{ name: "token", ref: "vault://api-key" }],
        },
      },
      secrets,
    );
    await expect(resolver.resolve("api")).resolves.toBe("key-456");
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
