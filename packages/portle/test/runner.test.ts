import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortleRunner } from "../src/runner.js";
import { readSiteSettings, writeEnrollment } from "../src/state.js";
import type {
  SupervisedLike,
  SupervisedOptions,
  SupervisedStatus,
} from "../src/supervisor.js";
import { enrollment } from "./fixtures.js";

let dir: string;
let stateDir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "portle-runner-"));
  stateDir = join(dir, ".ph", "portle");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fakeSupervised(
  options: SupervisedOptions,
): SupervisedLike & { options: SupervisedOptions } {
  let running = false;
  const status = (): SupervisedStatus => ({
    name: options.name,
    command: [options.command, ...options.args].join(" "),
    running,
    pid: running ? 4242 : null,
    startedAt: running ? "2026-10-26T20:00:00.000Z" : null,
    restarts: 0,
    lastExit: null,
  });
  return {
    options,
    start: () => {
      running = true;
    },
    stop: () => {
      running = false;
      return Promise.resolve();
    },
    status,
  };
}

const answering = (body: string, status: number) =>
  (() =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      }),
    )) as typeof fetch;

const okFetch = answering(JSON.stringify(enrollment), 201);

function runnerWith(
  extra: Partial<ConstructorParameters<typeof PortleRunner>[0]> = {},
) {
  const created: ReturnType<typeof fakeSupervised>[] = [];
  const runner = new PortleRunner({
    stateDir,
    fetchImpl: okFetch,
    env: { PATH: "" },
    home: join(dir, "home"),
    platform: "linux",
    exists: (p) => p.endsWith("/bin/frpc") || p.endsWith("/bin/caddy"),
    createSupervised: (o) => {
      const s = fakeSupervised(o);
      created.push(s);
      return s;
    },
    ...extra,
  });
  return { runner, created };
}

describe("PortleRunner", () => {
  it("reports an un-enrolled project and no binaries", () => {
    const { runner } = runnerWith({ exists: () => false });
    const status = runner.status();
    expect(status).toMatchObject({
      enrolled: false,
      siteZone: null,
      settings: null,
      urls: [],
    });
    expect(status.tunnel.state).toBe("down");
    expect(status.binaries.frpc).toBeNull();
  });

  it("enrols once, stores the secrets with mode 600 and the control plane in the settings", async () => {
    const { runner } = runnerWith();
    const status = await runner.enrol({
      controlPlaneUrl: "https://cp-relaytest.portle.host/",
      token: "t0k",
    });
    expect(status.enrolled).toBe(true);
    expect(status.siteZone).toBe("dev.sektar.be");
    expect(status.delegation?.nameservers).toEqual([
      "ns1.relaytest.portle.host.",
    ]);
    expect(status.settings).toMatchObject({
      controlPlaneUrl: "https://cp-relaytest.portle.host",
      autostart: false,
    });
    expect(status.urls).toEqual(["https://app.dev.sektar.be/"]);
    expect(existsSync(join(stateDir, "enrollment.json"))).toBe(true);
    await expect(
      runner.enrol({ controlPlaneUrl: "https://cp", token: "again" }),
    ).rejects.toThrow(/already enrolled/);
  });

  it("refuses a bad control plane URL or a refused token", async () => {
    const { runner } = runnerWith();
    await expect(
      runner.enrol({ controlPlaneUrl: "cp.example", token: "t" }),
    ).rejects.toThrow(/http\(s\) URL/);
    const refusing = runnerWith({ fetchImpl: answering("unknown token", 404) });
    await expect(
      refusing.runner.enrol({ controlPlaneUrl: "https://cp", token: "t" }),
    ).rejects.toThrow(/HTTP 404/);
    expect(refusing.runner.status().enrolled).toBe(false);
  });

  it("configures upstreams and validates labels", async () => {
    const { runner } = runnerWith();
    await runner.enrol({ controlPlaneUrl: "https://cp", token: "t" });
    const status = runner.configure({
      appUpstream: "127.0.0.1:2540",
      upstreams: { api: "127.0.0.1:7540", app: "127.0.0.1:2540" },
    });
    expect(status.settings?.upstreams).toEqual({
      api: "127.0.0.1:7540",
      app: "127.0.0.1:2540",
    });
    expect(status.urls).toEqual([
      "https://api.dev.sektar.be/",
      "https://app.dev.sektar.be/",
    ]);
    expect(() => runner.configure({ upstreams: { "A.B": "x" } })).toThrow(
      /invalid upstream label/,
    );
    expect(() => runner.configure({ dns01Mode: "magic" as never })).toThrow(
      /dns01Mode/,
    );
    expect(() =>
      new PortleRunner({ stateDir: join(dir, "elsewhere") }).configure({}),
    ).toThrow(/not enrolled/);
  });

  it("refuses to start without binaries and names what it looked at", async () => {
    const { runner } = runnerWith({ exists: () => false });
    await runner.enrol({ controlPlaneUrl: "https://cp", token: "t" });
    await expect(runner.start()).rejects.toThrow(
      /frpc and caddy not found .*PORTLE_FRPC_BIN, PORTLE_CADDY_BIN.*Looked at/,
    );
    expect(runner.status().tunnel.state).toBe("down");
  });

  it("renders the configs, starts caddy then frpc, and remembers autostart", async () => {
    const log = vi.fn();
    const { runner, created } = runnerWith({ log });
    await runner.enrol({
      controlPlaneUrl: "https://cp-relaytest.portle.host",
      token: "t",
    });
    runner.configure({
      appUpstream: "127.0.0.1:2540",
      upstreams: { api: "127.0.0.1:7540" },
    });

    const status = await runner.start();

    expect(created.map((s) => s.options.name)).toEqual(["caddy", "frpc"]);
    const [caddy, frpc] = created;
    expect(caddy.options.args).toEqual([
      "run",
      "--config",
      join(stateDir, "Caddyfile"),
      "--adapter",
      "caddyfile",
    ]);
    expect(caddy.options.env?.XDG_DATA_HOME).toBe(join(stateDir, "caddy"));
    expect(frpc.options.args).toEqual(["-c", join(stateDir, "frpc.toml")]);
    expect(frpc.options.logFile).toBe(join(stateDir, "logs", "frpc.log"));

    const caddyfile = readFileSync(join(stateDir, "Caddyfile"), "utf8");
    expect(caddyfile).toContain("@api host api.dev.sektar.be");
    expect(caddyfile).toContain("reverse_proxy 127.0.0.1:7540");
    expect(caddyfile).toContain("allow 127.0.0.1/32");
    // no vanity domains yet, so no on-demand block and no ask URL
    expect(caddyfile).not.toContain("on_demand");
    expect(caddyfile).toContain(
      "acme_ca https://acme-staging-v02.api.letsencrypt.org/directory",
    );
    const frpcToml = readFileSync(join(stateDir, "frpc.toml"), "utf8");
    expect(frpcToml).toContain('localIP = "127.0.0.1"');
    expect(frpcToml).toContain(
      JSON.stringify(join(stateDir, "certs", "relay-ca.crt")),
    );
    expect(readFileSync(join(stateDir, "certs", "relay-ca.crt"), "utf8")).toBe(
      enrollment.frp.caPem,
    );

    expect(status.tunnel.state).toBe("up");
    expect(status.tunnel.frpc?.pid).toBe(4242);
    expect(readSiteSettings(stateDir)?.autostart).toBe(true);
    expect(runner.wantsAutostart()).toBe(true);
    expect(log).toHaveBeenCalledWith("tunnel started", {
      siteZone: "dev.sektar.be",
    });

    // start again is idempotent: the same supervised children, no new ones
    await runner.start();
    expect(created).toHaveLength(2);

    const stopped = await runner.stop();
    expect(stopped.tunnel.state).toBe("down");
    expect(readSiteSettings(stateDir)?.autostart).toBe(false);
    expect(runner.wantsAutostart()).toBe(false);
  });

  it("a seeded enrolment counts as enrolled, and render needs settings too", () => {
    const { runner } = runnerWith();
    writeEnrollment(stateDir, {
      ...enrollment,
      acme: { ...enrollment.acme, caRootPem: "ROOT" },
    });
    expect(runner.status().enrolled).toBe(true);
    expect(() => runner.render()).toThrow(/not enrolled/);
  });

  it("render alone writes the files, with the acme-dns fallback and the CA root when configured", async () => {
    const { runner } = runnerWith({
      fetchImpl: answering(
        JSON.stringify({
          ...enrollment,
          acme: { ...enrollment.acme, caRootPem: "ROOT" },
        }),
        201,
      ),
    });
    await runner.enrol({ controlPlaneUrl: "https://cp", token: "t" });
    runner.configure({ dns01Mode: "acmedns" });
    const out = runner.render();
    expect(out.caddyfile).toBe(join(stateDir, "Caddyfile"));
    const caddyfile = readFileSync(out.caddyfile, "utf8");
    expect(caddyfile).toContain("dns acmedns");
    expect(caddyfile).toContain(
      'server_url "https://cp-relaytest.portle.host/v1/acmedns"',
    );
    expect(caddyfile).not.toContain("rfc2136");
    expect(caddyfile).toContain(
      `acme_ca_root "${join(stateDir, "certs", "acme-ca-root.pem").replace(/\\/g, "/")}"`,
    );
    expect(
      readFileSync(join(stateDir, "certs", "acme-ca-root.pem"), "utf8"),
    ).toBe("ROOT");
  });
});
