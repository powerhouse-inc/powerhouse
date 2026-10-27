import { describe, expect, it } from "vitest";
import {
  isSiteId,
  isSiteZone,
  isWellFormedHostname,
  siteWildcard,
} from "../src/site/hostnames.js";
import { renderCaddyfile, rfc2136Dns } from "../src/site/render-caddyfile.js";
import { renderFrpcToml } from "../src/site/render-frpc.js";

const ZONE = "dev.sektar.be";

const frpcInput = {
  siteId: "s1aaaaaaaa",
  siteSecret: "deadbeef",
  siteZone: ZONE,
  serverAddr: "relay1.relaytest.portle.host",
  serverPort: 7000,
  serverName: "relay1.relaytest.portle.host",
  token: "tok",
  trustedCaFile: "D:\\p\\.ph\\portle\\certs\\relay-ca.crt",
  caddyHost: "127.0.0.1",
  vanityDomains: [] as string[],
};

const caddyInput = {
  siteId: "s1aaaaaaaa",
  siteZone: ZONE,
  email: "ops@portle.host",
  acmeCaUrl: "https://acme-staging-v02.api.letsencrypt.org/directory",
  proxyAllowCidr: "127.0.0.1/32",
  appUpstream: "127.0.0.1:2540",
  upstreams: { api: "127.0.0.1:7540", app: "127.0.0.1:2540" },
  vanityDomains: [] as string[],
  askUrl: "https://cp-relaytest.portle.host/v1/tls/ask",
  resolvers: ["204.168.235.130"],
  dns01: rfc2136Dns(
    `site-s1aaaaaaaa.${ZONE}`,
    "c2VjcmV0",
    "204.168.235.130:53",
  ),
};

describe("hostname rules", () => {
  it("accepts a site id, a zone, a wildcard", () => {
    expect(isSiteId("cq19vyx1m8")).toBe(true);
    expect(isSiteId("CQ19vyx1m8")).toBe(false);
    expect(isSiteZone(ZONE)).toBe(true);
    expect(isSiteZone("sektar")).toBe(false);
    expect(isSiteZone("xn--abc.example")).toBe(false);
    expect(isWellFormedHostname("app.dev.sektar.be")).toBe(true);
    expect(isWellFormedHostname("App.dev.sektar.be")).toBe(false);
    expect(siteWildcard(ZONE)).toBe("*.dev.sektar.be");
  });
});

describe("renderFrpcToml", () => {
  it("claims the zone wildcard with PROXY v2 on the https proxy only", () => {
    const toml = renderFrpcToml(frpcInput);
    expect(toml).toContain('user = "s1aaaaaaaa"');
    expect(toml).toContain('clientID = "s1aaaaaaaa"');
    expect(toml).toContain('metadatas.site_secret = "deadbeef"');
    expect(toml).toContain('localIP = "127.0.0.1"');
    expect(toml).toContain('customDomains = ["*.dev.sektar.be"]');
    expect(toml.match(/transport\.proxyProtocolVersion = "v2"/g)).toHaveLength(
      1,
    );
    expect(toml).toContain(
      'transport.tls.trustedCaFile = "D:\\\\p\\\\.ph\\\\portle\\\\certs\\\\relay-ca.crt"',
    );
  });

  it("adds vanity domains to both proxies", () => {
    const toml = renderFrpcToml({
      ...frpcInput,
      vanityDomains: ["portal.sektar.be"],
    });
    expect(
      toml.match(
        /customDomains = \["\*\.dev\.sektar\.be", "portal\.sektar\.be"\]/g,
      ),
    ).toHaveLength(2);
  });

  it.each([
    ["bad site id", { siteId: "BAD" }],
    ["single-label zone", { siteZone: "sektar" }],
    ["wildcard vanity", { vanityDomains: ["*.sektar.be"] }],
    ["bad port", { serverPort: 70000 }],
  ])("rejects %s", (_n, over) => {
    expect(() => renderFrpcToml({ ...frpcInput, ...over })).toThrow();
  });
});

describe("renderCaddyfile", () => {
  it("routes api and app by host and everything else to the default upstream", () => {
    const out = renderCaddyfile(caddyInput);
    const block = out.slice(out.indexOf(`*.${ZONE} {`));
    expect(block).toContain(`@api host api.${ZONE}`);
    expect(block).toContain("handle @api {\n\t\treverse_proxy 127.0.0.1:7540");
    expect(block).toContain(`@app host app.${ZONE}`);
    expect(block).toContain("handle {\n\t\treverse_proxy 127.0.0.1:2540\n\t}");
    expect(block.lastIndexOf("handle {")).toBeGreaterThan(
      block.lastIndexOf("handle @"),
    );
    expect(out).toContain("allow 127.0.0.1/32");
    expect(out).toContain(
      "acme_ca https://acme-staging-v02.api.letsencrypt.org/directory",
    );
    expect(out).toContain(`key_name "site-s1aaaaaaaa.${ZONE}"`);
    expect(out).not.toContain("on_demand");
  });

  it("falls back to one reverse_proxy without labels and omits acme_ca in production", () => {
    const out = renderCaddyfile({
      ...caddyInput,
      upstreams: {},
      acmeCaUrl: undefined,
    });
    expect(out).toContain("\treverse_proxy 127.0.0.1:2540\n}");
    expect(out).not.toContain("handle");
    expect(out).not.toContain("acme_ca");
  });

  it("serves vanity domains on demand from the default upstream", () => {
    const out = renderCaddyfile({
      ...caddyInput,
      vanityDomains: ["portal.sektar.be"],
    });
    expect(out).toContain("ask https://cp-relaytest.portle.host/v1/tls/ask");
    expect(out.slice(out.indexOf("https:// {"))).toContain(
      "reverse_proxy 127.0.0.1:2540",
    );
  });

  it("renders the acme-dns fallback", () => {
    const out = renderCaddyfile({
      ...caddyInput,
      dns01: {
        mode: "acmedns",
        username: "u",
        password: 'p"q',
        subdomain: "s1aaaaaaaa",
        serverUrl: "https://cp/v1/acmedns",
      },
    });
    expect(out).toContain('password "p\\"q"');
    expect(out).not.toContain("rfc2136");
  });

  it.each([
    ["upstream injection", { appUpstream: "x:80 }\nrespond 200" }],
    [
      "labelled upstream injection",
      { upstreams: { api: "x:1 }\nrespond 200" } },
    ],
    ["uppercase label", { upstreams: { API: "x:1" } }],
    ["cidr injection", { proxyAllowCidr: "0.0.0.0/0 }" }],
    ["no resolvers", { resolvers: [] }],
  ])("rejects %s", (_n, over) => {
    expect(() => renderCaddyfile({ ...caddyInput, ...over })).toThrow();
  });
});

describe("listen ports", () => {
  it("default to 443/80 with no global port lines", () => {
    const out = renderCaddyfile(caddyInput);
    expect(out).not.toContain("https_port");
    expect(out).not.toContain("http_port");
    expect(out).toContain("servers :443 {");
    const toml = renderFrpcToml(frpcInput);
    expect(toml).toContain("localPort = 443");
    expect(toml).toContain("localPort = 80");
  });

  it("move Caddy's automatic HTTPS and the frpc targets to the given ports", () => {
    const out = renderCaddyfile({
      ...caddyInput,
      listen: { https: 8443, http: 8080 },
    });
    expect(out).toContain("\thttps_port 8443\n\thttp_port 8080");
    expect(out).toContain("servers :8443 {");
    const toml = renderFrpcToml({
      ...frpcInput,
      localHttpsPort: 8443,
      localHttpPort: 8080,
    });
    expect(toml).toContain("localPort = 8443");
    expect(toml).toContain("localPort = 8080");
  });

  it("reject bad or equal ports", () => {
    expect(() =>
      renderCaddyfile({ ...caddyInput, listen: { https: 70000, http: 80 } }),
    ).toThrow(/HTTPS port/);
    expect(() =>
      renderCaddyfile({ ...caddyInput, listen: { https: 8080, http: 8080 } }),
    ).toThrow(/differ/);
    expect(() => renderFrpcToml({ ...frpcInput, localHttpPort: -1 })).toThrow(
      /local HTTP port/,
    );
  });
});

describe("rewriteHostHeader", () => {
  it("is off by default: the public name reaches the upstream", () => {
    expect(renderCaddyfile(caddyInput)).not.toContain("header_up");
  });

  it("hands every upstream its own host:port when on, labels, fallback and vanity alike", () => {
    const out = renderCaddyfile({
      ...caddyInput,
      rewriteHostHeader: true,
      vanityDomains: ["portal.sektar.be"],
    });
    expect(out).toContain(
      "\t\treverse_proxy 127.0.0.1:7540 {\n\t\t\theader_up Host {upstream_hostport}\n\t\t}",
    );
    expect(out).toContain(
      "\thandle {\n\t\treverse_proxy 127.0.0.1:2540 {\n\t\t\theader_up Host {upstream_hostport}\n\t\t}\n\t}",
    );
    expect(out.slice(out.indexOf("https:// {"))).toContain(
      "\treverse_proxy 127.0.0.1:2540 {\n\t\theader_up Host {upstream_hostport}\n\t}",
    );
    expect(out.match(/header_up Host/g)).toHaveLength(4);
  });
});

describe("appRoute (same-origin publication)", () => {
  const withRoute = {
    ...caddyInput,
    appRoute: {
      label: "app",
      apiTarget: "127.0.0.1:7540",
      configPath: "/portle/public/powerhouse.config.json",
    },
  };

  it("sends the switchboard paths on the app label to the api upstream and the rest to the app", () => {
    const out = renderCaddyfile(withRoute);
    const appStart = out.indexOf("handle @app {");
    const app = out.slice(appStart, out.indexOf("\n\t}\n", appStart));
    for (const path of [
      "/graphql*",
      "/d/*",
      "/attachments*",
      "/mcp*",
      "/api/*",
      "/ready",
      "/health",
      "/explorer*",
    ]) {
      expect(app).toContain(
        `\t\thandle ${path} {\n\t\t\treverse_proxy 127.0.0.1:7540\n\t\t}`,
      );
    }
    expect(app).toContain(
      "\t\thandle /powerhouse.config.json {\n\t\t\trewrite * /portle/public/powerhouse.config.json\n\t\t\treverse_proxy 127.0.0.1:7540\n\t\t}",
    );
    expect(app).toContain(
      "\t\thandle {\n\t\t\treverse_proxy 127.0.0.1:2540\n\t\t}",
    );
    // the api label itself is untouched
    expect(out).toContain(
      "handle @api {\n\t\treverse_proxy 127.0.0.1:7540\n\t}",
    );
  });

  it("omits the config handle without a config path, and composes with the host rewrite", () => {
    const out = renderCaddyfile({
      ...withRoute,
      appRoute: { label: "app", apiTarget: "127.0.0.1:7540" },
      rewriteHostHeader: true,
    });
    expect(out).not.toContain("powerhouse.config.json");
    expect(out).toContain(
      "\t\thandle {\n\t\t\treverse_proxy 127.0.0.1:2540 {\n\t\t\t\theader_up Host {upstream_hostport}\n\t\t\t}\n\t\t}",
    );
    expect(out).toContain(
      "\t\thandle /graphql* {\n\t\t\treverse_proxy 127.0.0.1:7540 {\n\t\t\t\theader_up Host {upstream_hostport}",
    );
  });

  it.each([
    ["an unknown label", { appRoute: { label: "web", apiTarget: "x:1" } }],
    [
      "an injected api target",
      { appRoute: { label: "app", apiTarget: "x:1 }\nrespond 200" } },
    ],
    [
      "an injected config path",
      {
        appRoute: {
          label: "app",
          apiTarget: "x:1",
          configPath: "/p }\nrespond 200",
        },
      },
    ],
  ])("rejects %s", (_n, over) => {
    expect(() => renderCaddyfile({ ...caddyInput, ...over })).toThrow();
  });
});
