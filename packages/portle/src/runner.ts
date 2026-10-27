import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  resolveBinaries,
  type BinaryLocations,
  type ResolveBinariesOptions,
} from "./binaries.js";
import { isDelegated, type ResolveNs } from "./delegation.js";
import {
  PUBLIC_CONFIG_PATH,
  type PublicConfigSource,
} from "./public-config.js";
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
  Pick<
    SiteSettings,
    | "appUpstream"
    | "upstreams"
    | "dns01Mode"
    | "listen"
    | "rewriteHostHeader"
    | "sameOrigin"
  >
>;

/** What the subgraph and the hooks drive; the class below is the real one. */
export interface PortleRunnerLike {
  status(): TunnelStatus;
  /** True/false for a customer zone; null when the site needs no delegation. */
  checkDelegation(): Promise<boolean | null>;
  enrol(input: EnrolInput): Promise<TunnelStatus>;
  configure(patch: SettingsPatch): TunnelStatus;
  start(): Promise<TunnelStatus>;
  /** Stops both processes; clears `autostart` unless `keepAutostart` (a host shutdown). */
  stop(options?: StopOptions): Promise<TunnelStatus>;
  /** What the public-config route serves; null while not published same-origin. */
  publicConfigSource(): PublicConfigSource | null;
}

export interface StopOptions {
  /** The host is going down, not the operator's wish: the tunnel comes back at the next boot. */
  keepAutostart?: boolean;
}

export interface PortleRunnerDeps extends ResolveBinariesOptions {
  stateDir: string;
  fetchImpl?: typeof fetch;
  resolveNs?: ResolveNs;
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

  async checkDelegation(): Promise<boolean | null> {
    const delegation = this.#enrollment()?.delegation;
    if (!delegation) return null;
    return isDelegated(delegation, this.#deps.resolveNs);
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
    if (patch.listen) {
      for (const [name, value] of Object.entries(patch.listen)) {
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          throw new Error(`listen.${name} must be a port number`);
        }
      }
      if (patch.listen.https === patch.listen.http) {
        throw new Error("listen.https and listen.http must differ");
      }
    }
    writeSiteSettings(this.#deps.stateDir, { ...settings, ...patch });
    return this.status();
  }

  /** Writes the CA files, frpc.toml and the Caddyfile for the current enrolment and settings. */
  render(): {
    frpcConfig: string;
    caddyfile: string;
    certsDir: string;
  } {
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
        localHttpsPort: settings.listen.https,
        localHttpPort: settings.listen.http,
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
    const appRoute = this.#appRoute(settings);
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
        listen: settings.listen,
        rewriteHostHeader: settings.rewriteHostHeader ?? false,
        appRoute,
      }),
      0o600,
    );
    return { frpcConfig, caddyfile, certsDir };
  }

  /**
   * Brings the tunnel up. A customer zone must be delegated first: Caddy
   * would otherwise ask the CA for a name the CA cannot resolve, and the
   * negative answer is cached for an hour.
   */
  async start(): Promise<TunnelStatus> {
    const delegation = this.#requireEnrollment().delegation;
    if (delegation && !(await this.checkDelegation())) {
      throw new Error(
        `cannot start: ${delegation.zone} is not delegated yet. Create at your DNS provider: ${delegation.nameservers
          .map((ns) => `${delegation.zone} NS ${ns}`)
          .join("; ")} — then start again.`,
      );
    }
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
    return this.#startNow(
      { frpc: binaries.frpc!, caddy: binaries.caddy! },
      { frpcConfig, caddyfile },
    );
  }

  #startNow(
    binaries: { frpc: string; caddy: string },
    { frpcConfig, caddyfile }: { frpcConfig: string; caddyfile: string },
  ): TunnelStatus {
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

  async stop(options: StopOptions = {}): Promise<TunnelStatus> {
    await this.#frpc?.stop();
    await this.#caddy?.stop();
    this.#frpc = null;
    this.#caddy = null;
    if (
      !options.keepAutostart &&
      this.#enrollment() &&
      readSiteSettings(this.#deps.stateDir)
    ) {
      writeSiteSettings(this.#deps.stateDir, {
        ...this.#settings(),
        autostart: false,
      });
    }
    this.#deps.log?.("tunnel stopped", {
      autostart: this.wantsAutostart(),
    });
    return this.status();
  }

  /** Whether the operator asked for the tunnel to come up at boot. */
  wantsAutostart(): boolean {
    return (
      this.#enrollment() !== null &&
      readSiteSettings(this.#deps.stateDir)?.autostart === true
    );
  }

  /**
   * Same-origin publication for the `app` label: its handle also proxies the
   * switchboard's paths to the `api` upstream, and sends
   * `/powerhouse.config.json` to the switchboard's public-config route, which
   * answers with the app's own config rewritten to the public origin (see
   * `public-config.ts`). The SPA then calls its own origin: no cross-origin
   * requests and no browser prompt for a local address. Nothing is fetched
   * here: the route reads the app's config when a browser asks, so it does
   * not matter which of the two came up first.
   */
  #appRoute(
    settings: SiteSettings,
  ): { label: string; apiTarget: string; configPath: string } | undefined {
    if (!this.#sameOrigin(settings)) return undefined;
    return {
      label: "app",
      apiTarget: settings.upstreams.api!,
      configPath: PUBLIC_CONFIG_PATH,
    };
  }

  /** Same-origin applies: both labels exist and the operator did not switch it off. */
  #sameOrigin(settings: SiteSettings): boolean {
    return (
      settings.sameOrigin !== false &&
      !!settings.upstreams.app &&
      !!settings.upstreams.api
    );
  }

  /**
   * What the public-config route rewrites and from where, or null while the
   * site is not published same-origin (not enrolled, a label missing, or
   * switched off).
   */
  publicConfigSource(): PublicConfigSource | null {
    const enrollment = this.#enrollment();
    if (!enrollment) return null;
    const settings = this.#settings();
    if (!this.#sameOrigin(settings)) return null;
    const api = settings.upstreams.api!;
    return {
      appUrl: `http://${settings.upstreams.app!}`,
      apiPort: api.split(":").pop() ?? "",
      publicOrigin: `https://app.${enrollment.siteZone}`,
    };
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
