import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOAuthApps } from "../../src/workflow/oauth-apps-config.js";

const DIR = path.resolve("/project");
const RELAY = {
  clientId: "relay-cid",
  redirectUri: "https://sektar.io/api/oauth/callback",
  tokenUrl: "https://sektar.io/api/oauth/token",
};

describe("workflows.oauthApps", () => {
  it("resolves client files from the config file's folder and keeps a relay", () => {
    expect(
      parseOAuthApps(
        [
          {
            id: "sektar-google",
            clients: { desktop: "secrets/desktop.json" },
            relay: RELAY,
          },
        ],
        DIR,
      ),
    ).toEqual([
      {
        id: "sektar-google",
        clients: { desktop: path.join(DIR, "secrets/desktop.json") },
        relay: RELAY,
      },
    ]);
  });

  it("drops a relay that is not an object, keeping the app", () => {
    const dropped: [string, unknown][] = [];
    const apps = parseOAuthApps(
      [
        { id: "string", clients: { web: "w.json" }, relay: RELAY.redirectUri },
        { id: "list", clients: { web: "w.json" }, relay: [RELAY] },
        { id: "null", clients: { web: "w.json" }, relay: null },
        { id: "none", clients: { web: "w.json" } },
      ],
      DIR,
      (id, relay) => dropped.push([id, relay]),
    );
    expect(apps.map((app) => app.id)).toEqual([
      "string",
      "list",
      "null",
      "none",
    ]);
    for (const app of apps) expect(app).not.toHaveProperty("relay");
    expect(dropped).toEqual([
      ["string", RELAY.redirectUri],
      ["list", [RELAY]],
      ["null", null],
    ]);
  });

  it("leaves out entries without an id and reads a non-list as none", () => {
    expect(parseOAuthApps([{ clients: {} }, null, { id: "" }], DIR)).toEqual(
      [],
    );
    expect(parseOAuthApps({ id: "x" }, DIR)).toEqual([]);
  });
});
