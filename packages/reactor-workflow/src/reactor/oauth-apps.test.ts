import { describe, expect, it } from "vitest";
import type { SecretStat, SecretStore } from "../pieces/index.js";
import {
  StaticOAuthAppRegistry,
  clientKindFor,
  clientSecretLabel,
  loadOAuthApps,
  oauthSignInFor,
  parseClientFile,
  parseRelay,
  grantedScopes,
  scopesOverride,
} from "./oauth-apps.js";

function memoryStore(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  const stats = new Map<string, SecretStat>();
  let n = 0;
  const stat = (
    ref: string,
    label: string | null,
    ownerId: string | null,
  ): SecretStat => ({
    ref,
    label,
    ownerId,
    createdBy: null,
    version: 1,
    status: "ACTIVE",
    createdAt: "",
    updatedAt: "",
  });
  return {
    values,
    create: ({ value, label, ownerId }) => {
      const ref = `secret://v1:${(++n).toString(16).padStart(32, "0")}`;
      values.set(ref, value);
      stats.set(ref, stat(ref, label ?? null, ownerId));
      return Promise.resolve(stats.get(ref)!);
    },
    rotate: (ref, value) => {
      values.set(ref, value);
      return Promise.resolve(stats.get(ref)!);
    },
    get: (ref) => Promise.resolve(values.get(ref)!),
    stat: (ref) => Promise.resolve(stats.get(ref)!),
    list: () => Promise.resolve([...stats.values()]),
    delete: () => Promise.resolve(),
  };
}

const google = (kind: "installed" | "web", id: string, secret: string) =>
  JSON.stringify({ [kind]: { client_id: id, client_secret: secret } });

describe("OAuth2 apps", () => {
  it("takes the desktop client for a loopback callback, the web client otherwise", () => {
    expect(clientKindFor("http://localhost:7540/cb")).toBe("desktop");
    expect(clientKindFor("http://127.0.0.1:4101/cb")).toBe("desktop");
    expect(clientKindFor("http://[::1]:4101/cb")).toBe("desktop");
    expect(clientKindFor("https://app.dev.sektar.be/cb")).toBe("web");
    expect(clientKindFor("not a url")).toBe("web");
  });

  it("reads scopes from a list or a space-separated string", () => {
    expect(scopesOverride({ oauth_scopes: ["a", " b "] })).toEqual(["a", "b"]);
    expect(scopesOverride({ oauth_scopes: "a  b" })).toEqual(["a", "b"]);
    expect(scopesOverride({ oauth_scopes: "" })).toBeUndefined();
    // What a sign-in covers: the token's scope, else what was asked for
    expect(
      grantedScopes("openid https://x/email", { oauth_scopes: ["a"] }),
    ).toEqual(["openid", "https://x/email"]);
    expect(grantedScopes(undefined, { oauth_scopes: ["a"] })).toEqual(["a"]);
    expect(grantedScopes("", {})).toBeUndefined();
    expect(scopesOverride({})).toBeUndefined();
  });

  it("reads Google's client files and flat ones", () => {
    expect(parseClientFile(google("installed", "id", "s"))).toEqual({
      clientId: "id",
      clientSecret: "s",
    });
    expect(
      parseClientFile(JSON.stringify({ client_id: "id", client_secret: "s" })),
    ).toEqual({ clientId: "id", clientSecret: "s" });
    expect(() => parseClientFile("{")).toThrow("not JSON");
    expect(() => parseClientFile("{}")).toThrow("no client_id");
    expect(() => parseClientFile('{"client_id":"x"}')).toThrow(
      "no client_secret",
    );
  });

  it("keeps each client secret in the store under its label, rotating it when the file changes", async () => {
    const store = memoryStore();
    const files = new Map([
      ["d.json", google("installed", "desk", "s1")],
      ["w.json", google("web", "web", "w1")],
    ]);
    const read = (path: string) => Promise.resolve(files.get(path)!);
    const apps = [
      { id: "sektar", clients: { desktop: "d.json", web: "w.json" } },
    ];

    const first = await loadOAuthApps(apps, store, { read });
    const desk = first.client("sektar", "desktop")!;
    expect(desk.clientId).toBe("desk");
    expect(store.values.get(desk.clientSecretRef)).toBe("s1");
    expect(first.clients("sektar")).toHaveLength(2);
    expect(first.client("other", "web")).toBeUndefined();

    // A restart finds the same secret; a new file rotates it in place
    files.set("d.json", google("installed", "desk", "s2"));
    const second = await loadOAuthApps(apps, store, { read });
    expect(second.client("sektar", "desktop")!.clientSecretRef).toBe(
      desk.clientSecretRef,
    );
    expect(store.values.get(desk.clientSecretRef)).toBe("s2");
    expect((await store.list()).map((s) => s.label).sort()).toEqual([
      clientSecretLabel("sektar", "desktop"),
      clientSecretLabel("sektar", "web"),
    ]);
  });

  it("never takes a document's secret that shares a client's label", async () => {
    const store = memoryStore();
    const label = clientSecretLabel("sektar", "web");
    const planted = await store.create({
      value: "users-own",
      label,
      ownerId: "connection-1",
    });
    const read = () => Promise.resolve(google("web", "web", "w1"));

    const registry = await loadOAuthApps(
      [{ id: "sektar", clients: { web: "w.json" } }],
      store,
      { read },
    );
    const web = registry.client("sektar", "web")!;
    expect(web.clientSecretRef).not.toBe(planted.ref);
    expect(store.values.get(web.clientSecretRef)).toBe("w1");
    expect(store.values.get(planted.ref)).toBe("users-own");
  });

  it("skips a client whose file cannot be read, keeping the others", async () => {
    const skipped: string[] = [];
    const registry = await loadOAuthApps(
      [{ id: "sektar", clients: { desktop: "missing.json", web: "w.json" } }],
      memoryStore(),
      {
        read: (path) =>
          path === "w.json"
            ? Promise.resolve(google("web", "web", "w"))
            : Promise.reject(new Error("ENOENT")),
        onSkip: (app, kind, reason) =>
          skipped.push(`${app}/${kind}: ${reason}`),
      },
    );
    expect(registry.client("sektar", "web")?.clientId).toBe("web");
    expect(registry.client("sektar", "desktop")).toBeUndefined();
    expect(skipped).toEqual(["sektar/desktop: missing.json: ENOENT"]);
  });

  it("keeps an app's relay and drops one it cannot use, keeping the app", async () => {
    const dropped: string[] = [];
    const read = () => Promise.resolve(google("web", "web", "w"));
    const relay = {
      clientId: "relay-cid",
      redirectUri: "https://relay.example/api/oauth/callback",
      tokenUrl: "https://relay.example/api/oauth/token",
    };
    const registry = await loadOAuthApps(
      [
        { id: "relayed", clients: {}, relay },
        {
          id: "plain-http",
          clients: { web: "w.json" },
          relay: { ...relay, tokenUrl: "http://relay.example/token" },
        },
        {
          id: "a-string",
          clients: { web: "w.json" },
          relay: "https://relay.example/cb" as never,
        },
        { id: "none", clients: { web: "w.json" } },
      ],
      memoryStore(),
      {
        read,
        onRelayDropped: (app, reason) => dropped.push(`${app}: ${reason}`),
      },
    );
    expect(registry.relay("relayed")).toEqual(relay);
    expect(registry.clients("relayed")).toEqual([]);
    expect(registry.relay("plain-http")).toBeUndefined();
    expect(registry.relay("a-string")).toBeUndefined();
    expect(registry.relay("none")).toBeUndefined();
    expect(registry.client("plain-http", "web")?.clientId).toBe("web");
    expect(dropped).toEqual([
      "plain-http: tokenUrl is not an absolute https URL",
      "a-string: not an object with clientId, redirectUri and tokenUrl",
    ]);
  });

  it("takes a relay with a client id and two absolute https URLs without credentials", () => {
    const relay = {
      clientId: "cid",
      redirectUri: "https://relay.example/cb",
      tokenUrl: "https://relay.example/token",
    };
    expect(parseRelay(relay)).toEqual(relay);
    expect(parseRelay({ ...relay, clientId: "" })).toBe("no clientId");
    expect(parseRelay({ ...relay, redirectUri: "/cb" })).toBe(
      "redirectUri is not an absolute https URL",
    );
    expect(
      parseRelay({ ...relay, redirectUri: "https://u:p@relay.example/cb" }),
    ).toBe("redirectUri is not an absolute https URL");
    expect(parseRelay({ ...relay, tokenUrl: undefined })).toBe(
      "tokenUrl is not an absolute https URL",
    );
    expect(parseRelay(null)).toBe(
      "not an object with clientId, redirectUri and tokenUrl",
    );
  });

  it("signs in with the callback's client, else the relay for a web callback, else not at all", () => {
    const relay = {
      clientId: "relay-cid",
      redirectUri: "https://relay.example/cb",
      tokenUrl: "https://relay.example/token",
    };
    const desktop = {
      appId: "relayed",
      kind: "desktop" as const,
      clientId: "desk",
      clientSecretRef: "ref-d",
    };
    const web = {
      appId: "both",
      kind: "web" as const,
      clientId: "web",
      clientSecretRef: "ref-w",
    };
    const apps = new StaticOAuthAppRegistry(
      [desktop, web],
      new Map([
        ["relayed", relay],
        ["both", relay],
      ]),
    );
    const loopback = "http://localhost:7540/oauth/callback";
    const cloud = "https://env.vetra.io/oauth/callback";
    expect(oauthSignInFor(apps, "relayed", loopback)).toEqual({
      mode: "desktop",
      client: desktop,
    });
    expect(oauthSignInFor(apps, "relayed", cloud)).toEqual({
      mode: "relay",
      relay,
    });
    // A web client file wins over the relay
    expect(oauthSignInFor(apps, "both", cloud)).toEqual({
      mode: "web",
      client: web,
    });
    // No desktop client: the relay never serves a loopback callback
    expect(oauthSignInFor(apps, "both", loopback)).toEqual({
      mode: "none",
      kind: "desktop",
    });
    expect(oauthSignInFor(apps, "unknown", cloud)).toEqual({
      mode: "none",
      kind: "web",
    });
  });
});
