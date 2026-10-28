import { describe, expect, it } from "vitest";
import type { SecretStat, SecretStore } from "../pieces/index.js";
import {
  clientKindFor,
  clientSecretLabel,
  loadOAuthApps,
  parseClientFile,
  scopesOverride,
} from "./oauth-apps.js";

function memoryStore(): SecretStore & { values: Map<string, string> } {
  const values = new Map<string, string>();
  const stats = new Map<string, SecretStat>();
  let n = 0;
  const stat = (ref: string, label: string | null): SecretStat => ({
    ref,
    label,
    version: 1,
    status: "ACTIVE",
    createdAt: "",
    updatedAt: "",
  });
  return {
    values,
    create: ({ value, label }) => {
      const ref = `secret://v1:${(++n).toString(16).padStart(32, "0")}`;
      values.set(ref, value);
      stats.set(ref, stat(ref, label ?? null));
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
});
