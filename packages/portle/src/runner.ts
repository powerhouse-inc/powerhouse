import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  resolveBinaries,
  type BinaryLocations,
  type ResolveBinariesOptions,
} from "./binaries.js";
import { enrolWithControlPlane } from "./site/enrol.js";
import { LABEL_RE } from "./site/hostnames.js";
import {
  renderCaddyfile,
  rfc2136Dns,
  type Dns01,
} from "./site/render-caddyfile.js";
import { renderFrpcToml } from "./site/render-frpc.js";
import type { EnrollmentResponse } from "./site/types.js";
import {
  DEFAULT_SITE_SETTINGS,
  readEnrollment,
  readSiteSettings,
  writeEnrollment,
  writeFileAtomic,
  writeSiteSettings,
  type SiteSettings,
} from "./state.js";
import {
  Supervised,
  type SupervisedLike,
  type SupervisedOptions,
  type SupervisedStatus,
} from "./supervisor.js";

export type TunnelState = "down" | "up" | "degraded";

export interface TunnelStatus {
  stateDir: string;
  enrolled: boolean;
  siteId: string | null;
  siteZone: string | null;
  zoneKind: string | null;
  delegation: { zone: string; nameservers: string[] } | null;
  settings: SiteSettings | null;
  binaries: BinaryLocations;
  tunnel: {
    state: TunnelState;
    frpc: SupervisedStatus | null;
    caddy: SupervisedStatus | null;
  };
  /** The public names this site serves, from its labels. */
  urls: string[];
}

export interface EnrolInput {
  controlPlaneUrl: string;
  token: string;
}

export type SettingsPatch = Partial<
  Pick<SiteSettings, "appUpstream" | "upstreams" | "dns01Mode">
>;

/** What the subgraph and the hooks drive; the class below is the real one. */
export interface PortleRunnerLike {
  status(): TunnelStatus;
  enrol(input: EnrolInput): Promise<TunnelStatus>;
  configure(patch: SettingsPatch): TunnelStatus;
  start(): Promise<TunnelStatus>;
  stop(): Promise<TunnelStatus>;
}

export interface PortleRunnerDeps extends ResolveBinariesOptions {
  stateDir: string;
  fetchImpl?: typeof fetch;
  createSupervised?: (options: SupervisedOptions) => SupervisedLike;
  log?: (msg: string, detail?: Record<string, unknown>) => void;
}

export class PortleRunner implements PortleRunnerLike {
  readonly #deps: PortleRunnerDeps;
  #frpc: SupervisedLike | null = null;
  #caddy: SupervisedLike | null = null;

  constructor(deps: PortleRunnerDeps) {
    this.#deps = { ...deps, stateDir: resolve(deps.stateDir) };
  }

  get stateDir(): string {
    return this.#deps.stateDir;
  }

  status(): TunnelStatus {
    const enrollment = this.#enrollment();
    const settings = enrollment ? readSiteSettings(this.#deps.stateDir) : null;
    const frpc = this.#frpc?.status() ?? null;
    const caddy = this.#caddy?.status() ?? null;
    const running = [frpc?.running, caddy?.running].filter(Boolean).length;
    const labels = Object.keys(settings?.upstreams ?? {});
    return {
      stateDir: this.#deps.stateDir,
      enrolled: enrollment !== null,
      siteId: enrollment?.siteId ?? null,
      siteZone: enrollment?.siteZone ?? null,
      zoneKind: enrollment?.zoneKind ?? null,
      delegation: enrollment?.delegation ?? null,
      settings,
      binaries: resolveBinaries(this.#deps),
      tunnel: {
        state: running === 2 ? "up" : running === 0 ? "down" : "degraded",
        frpc,
        caddy,
      },
      urls: enrollment
        ? (labels.length ? labels : ["app"]).map(
            (label) => `https://${label}.${enrollment.siteZone}/`,
          )
        : [],
    };
  }

  async enrol(input: EnrolInput): Promise<TunnelStatus> {
    if (this.#enrollment()) {
      throw new Error(
        "this project is already enrolled; remove .ph/portle/enrollment.json to enrol again",
      );
    }
    const controlPlaneUrl = input.controlPlaneUrl.replace(/\/$/, "");
    if (!/^https?:\/\//.test(controlPlaneUrl))
      throw new Error("controlPlaneUrl must be an http(s) URL");
    const enrollment = await enrolWithControlPlane(
      controlPlaneUrl,
      input.token,
      this.#deps.fetchImpl,
    );
    writeEnrollment(this.#deps.stateDir, enrollment);
    const existing = readSiteSettings(this.#deps.stateDir);
    writeSiteSettings(this.#deps.stateDir, {
      ...DEFAULT_SITE_SETTINGS,
      ...existing,
      controlPlaneUrl,
      autostart: false,
    });
    this.#deps.log?.("enrolled", {
      siteId: enrollment.siteId,
      siteZone: enrollment.siteZone,
      zoneKind: enrollment.zoneKind,
    });
    return this.status();
  }

  configure(patch: SettingsPatch): TunnelStatus {
    const settings = this.#settings();
    if (patch.upstreams) {
      for (const [label, target] of Object.entries(patch.upstreams)) {
        if (!LABEL_RE.test(label))
          throw new Error(`invalid upstream label ${JSON.stringify(label)}`);
        if (!target) throw new Error(`upstream ${label} has no target`);
      }
    }
    // Over the wire the mode is a plain string; the type says otherwise.
    const mode: string | undefined = patch.dns01Mode;
    if (mode && mode !== "rfc2136" && mode !== "acmedns") {
      throw new Error(`dns01Mode must be rfc2136 or acmedns`);
    }
    writeSiteSettings(this.#deps.stateDir, { ...settings, ...patch });
    return this.status();
  }

  /** Writes the CA files, frpc.toml and the Caddyfile for the current enrolment and settings. */
  render(): { frpcConfig: string; caddyfile: string; certsDir: string } {
    const enrollment = this.#requireEnrollment();
    const settings = this.#settings();
    const dir = this.#deps.stateDir;
    const certsDir = join(dir, "certs");
    mkdirSync(certsDir, { recursive: true });
    writeFileAtomic(
      join(certsDir, "relay-ca.crt"),
      enrollment.frp.caPem,
      0o600,
    );
    const acmeRoot = enrollment.acme.caRootPem
      ? join(certsDir, "acme-ca-root.pem")
      : undefined;
    if (acmeRoot && enrollment.acme.caRootPem)
      writeFileAtomic(acmeRoot, enrollment.acme.caRootPem, 0o600);

    const frpcConfig = join(dir, "frpc.toml");
    writeFileAtomic(
      frpcConfig,
      renderFrpcToml({
        siteId: enrollment.siteId,
        siteSecret: enrollment.siteSecret,
        siteZone: enrollment.siteZone,
        serverAddr: enrollment.frp.serverAddr,
        serverPort: enrollment.frp.serverPort,
        serverName: enrollment.frp.serverName,
        token: enrollment.frp.token,
        trustedCaFile: join(certsDir, "relay-ca.crt"),
        caddyHost: "127.0.0.1",
        vanityDomains: [],
      }),
      0o600,
    );

    const dns01: Dns01 =
      settings.dns01Mode === "acmedns"
        ? {
            mode: "acmedns",
            username: enrollment.acmeDns.username,
            password: enrollment.acmeDns.password,
            subdomain: enrollment.acmeDns.subdomain,
            serverUrl: enrollment.acmeDns.baseUrl,
          }
        : rfc2136Dns(
            enrollment.dns.tsigKeyName,
            enrollment.dns.tsigSecret,
            enrollment.dns.server,
            enrollment.dns.tsigAlgorithm,
          );
    const dnsHost =
      enrollment.dns.server.split(":")[0] ?? enrollment.dns.server;
    const caddyfile = join(dir, "Caddyfile");
    writeFileAtomic(
      caddyfile,
      renderCaddyfile({
        siteId: enrollment.siteId,
        siteZone: enrollment.siteZone,
        email: enrollment.acme.email,
        acmeCaUrl: enrollment.acme.caUrl,
        acmeCaRootFile: acmeRoot,
        // frpc runs on this machine and is the only PROXY-header sender.
        proxyAllowCidr: "127.0.0.1/32",
        appUpstream: settings.appUpstream,
        upstreams: settings.upstreams,
        vanityDomains: [],
        askUrl: `${settings.controlPlaneUrl}/v1/tls/ask`,
        resolvers: enrollment.dns.resolvers.length
          ? enrollment.dns.resolvers
          : [dnsHost],
        dns01,
      }),
      0o600,
    );
    return { frpcConfig, caddyfile, certsDir };
  }

  /** Rejects (never throws) so callers handle one failure shape. */
  start(): Promise<TunnelStatus> {
    return Promise.resolve().then(() => this.#startNow());
  }

  #startNow(): TunnelStatus {
    const binaries = resolveBinaries(this.#deps);
    const missing = (["frpc", "caddy"] as const).filter(
      (name) => !binaries[name],
    );
    if (missing.length > 0) {
      throw new Error(
        `cannot start: ${missing.join(" and ")} not found (set ${missing.map((n) => (n === "frpc" ? "PORTLE_FRPC_BIN" : "PORTLE_CADDY_BIN")).join(", ")} or install into ~/.ph/portle/bin). Looked at: ${binaries.searched.join(", ")}`,
      );
    }
    const { frpcConfig, caddyfile } = this.render();
    const dir = this.#deps.stateDir;
    const logs = join(dir, "logs");
    const create =
      this.#deps.createSupervised ??
      ((options: SupervisedOptions) => new Supervised(options));
    const log = this.#deps.log;
    const onEvent = (event: unknown) =>
      log?.("tunnel", event as Record<string, unknown>);

    if (!this.#caddy) {
      const caddyHome = join(dir, "caddy");
      mkdirSync(caddyHome, { recursive: true });
      this.#caddy = create({
        name: "caddy",
        command: binaries.caddy!,
        args: ["run", "--config", caddyfile, "--adapter", "caddyfile"],
        cwd: dir,
        logFile: join(logs, "caddy.log"),
        // Caddy keeps the certificate under its data dir; pin it beside the site.
        env: {
          ...(this.#deps.env ?? process.env),
          XDG_DATA_HOME: caddyHome,
          XDG_CONFIG_HOME: join(caddyHome, "config"),
        },
        onEvent,
      });
    }
    if (!this.#frpc) {
      this.#frpc = create({
        name: "frpc",
        command: binaries.frpc!,
        args: ["-c", frpcConfig],
        cwd: dir,
        logFile: join(logs, "frpc.log"),
        env: this.#deps.env ?? process.env,
        onEvent,
      });
    }
    this.#caddy.start();
    this.#frpc.start();
    writeSiteSettings(dir, { ...this.#settings(), autostart: true });
    log?.("tunnel started", { siteZone: this.#requireEnrollment().siteZone });
    return this.status();
  }

  async stop(): Promise<TunnelStatus> {
    await this.#frpc?.stop();
    await this.#caddy?.stop();
    this.#frpc = null;
    this.#caddy = null;
    if (this.#enrollment() && readSiteSettings(this.#deps.stateDir)) {
      writeSiteSettings(this.#deps.stateDir, {
        ...this.#settings(),
        autostart: false,
      });
    }
    this.#deps.log?.("tunnel stopped");
    return this.status();
  }

  /** Whether the operator asked for the tunnel to come up at boot. */
  wantsAutostart(): boolean {
    return (
      this.#enrollment() !== null &&
      readSiteSettings(this.#deps.stateDir)?.autostart === true
    );
  }

  #enrollment(): EnrollmentResponse | null {
    return existsSync(this.#deps.stateDir)
      ? readEnrollment(this.#deps.stateDir)
      : null;
  }

  #requireEnrollment(): EnrollmentResponse {
    const enrollment = this.#enrollment();
    if (!enrollment)
      throw new Error("this project is not enrolled with Portle yet");
    return enrollment;
  }

  #settings(): SiteSettings {
    const settings = readSiteSettings(this.#deps.stateDir);
    if (!settings)
      throw new Error("this project is not enrolled with Portle yet");
    return settings;
  }
}
