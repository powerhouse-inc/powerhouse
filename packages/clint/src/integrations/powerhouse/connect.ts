/**
 * Connect UI — generates a ServiceDefinition for Connect as a persistent child process.
 *
 * Two modes:
 * - **Static mode** (assetsDir set): serves pre-built SPA via connect-server.js
 * - **Studio mode** (no assetsDir): runs Vite dev server via `ph connect`
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { ServiceDefinition } from "../../core/types.js";
import type { ConnectConfig } from "./types.js";
import { checkCommand, checkPort } from "../../core/preflight.js";

/**
 * Resolve the path to the compiled connect-server.js script.
 * Works from both source (src/) and compiled (dist/) contexts.
 */
function resolveConnectServerScript(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return join(thisDir, "connect-server.js");
}

/**
 * Create a ServiceDefinition for Connect.
 *
 * Connect runs as a managed child process via ServiceManager, persisting
 * beyond CLI exit. It serves the Powerhouse Connect web UI pointing at
 * the Switchboard's drive URL.
 */
export function connectServiceDefinition(
  connectConfig: ConnectConfig,
): ServiceDefinition {
  const serviceName = connectConfig.name ?? "connect";
  const servicePort = connectConfig.port!; // Always stamped by resolveReactorDefaults
  const isStaticMode = !!connectConfig.assetsDir;

  return {
    id: serviceName,
    name: serviceName,
    description: "Powerhouse Connect web interface",
    command: ({ params }) => {
      const p = (params?.port as number) ?? servicePort;

      if (isStaticMode) {
        const serverScript = resolveConnectServerScript();
        // Deploy base for the dynamic-base Connect bundle — the proxy mount
        // path, substituted once at connect-server startup.
        const base = typeof params?.base === "string" ? params.base : undefined;
        // Quote interpolated values — the command runs via shell:true and
        // paths may contain spaces.
        const baseFlag =
          base && base !== "/" ? ` --base ${JSON.stringify(base)}` : "";
        // Opt-in only: precompression requires a bundle that is immutable after
        // boot — a consumer that rewrites assets in place would serve stale .br/.gz.
        const precompressFlag = connectConfig.precompress
          ? " --precompress"
          : "";
        return `node ${JSON.stringify(serverScript)} --dir ${JSON.stringify(connectConfig.assetsDir)} --port ${p}${baseFlag}${precompressFlag}`;
      }

      return `ph connect --port ${p}`;
    },
    env: ({ params }) => ({
      PH_CONNECT_DEFAULT_DRIVES_URL: (params?.driveUrl as string) ?? "",
      PH_CONNECT_DRIVES_PRESERVE_STRATEGY: "preserve-all",
      ...(connectConfig.registryUrl
        ? { PH_CONNECT_PACKAGES_REGISTRY: connectConfig.registryUrl }
        : {}),
    }),
    preflight: [
      // ph CLI is only needed for studio mode (Vite dev server)
      ...(isStaticMode
        ? []
        : [
            checkCommand("ph", {
              hint: "Install the Powerhouse CLI: npm install -g ph-cli",
            }),
          ]),
      checkPort(
        (ctx) => (ctx.params?.port as number) ?? servicePort,
        serviceName,
      ),
    ],
    readiness: {
      patterns: [
        {
          name: "connect",
          pattern: /Local:\s*(https?:\/\/[^\s]+)/,
          captures: {
            "connect-studio": {
              group: 1,
              type: "website" as const,
              proxyRoot: true,
            },
          },
        },
      ],
      timeout: 30_000,
    },
    shutdown: { signal: "SIGTERM", timeout: 5_000 },
    restart: { enabled: false, maxRetries: 0, delay: 0 },
  };
}
