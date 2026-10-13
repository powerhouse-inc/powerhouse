/**
 * Connect UI — generates a ServiceDefinition for Connect as a persistent child process.
 *
 * Two modes:
 * - **Static mode** (assetsDir set): serves the pre-built SPA via `ph-cli connect preview`
 * - **Studio mode** (no assetsDir): runs Vite dev server via `ph connect`
 */

import type { ServiceDefinition } from "../../core/types.js";
import type { ConnectConfig } from "./types.js";
import { checkCommand, checkPort } from "../../core/preflight.js";

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
        // NOTE(port/P5.7): the hand-rolled connect-server (sirv + injection)
        // is gone — `ph-cli connect preview` is the ONE static-serve
        // implementation, and it honors the same env contract this service
        // already sets (PH_CONNECT_DEFAULT_DRIVES_URL, registry → served
        // config + baked-CSP patch). `--base`/precompression ride the
        // dynamic-base bundle options of the build, not the server.
        return `npx --no-install ph-cli connect preview --outDir ${JSON.stringify(connectConfig.assetsDir)} --port ${p}`;
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
