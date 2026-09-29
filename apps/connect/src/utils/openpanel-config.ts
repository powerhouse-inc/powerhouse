import type { PHConnectOpenPanel } from "@powerhousedao/shared/clis";

/** The build-time (Vite env) OpenPanel settings, as parsed by loadRuntimeEnv. */
export type OpenPanelBuildEnv = {
  PH_CONNECT_OPENPANEL_CLIENT_ID?: string;
  PH_CONNECT_OPENPANEL_API_URL?: string;
  PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS: boolean;
  PH_CONNECT_OPENPANEL_TRACK_OPERATIONS: boolean;
};

export type ResolvedOpenPanelConfig = {
  clientId: string;
  apiUrl: string | undefined;
  trackUiEvents: boolean;
  trackOperations: boolean;
};

/**
 * Resolve Connect's OpenPanel settings. The runtime config
 * (`connect.openPanel`, settable per deploy via PH_CONNECT_CONFIG_JSON) wins;
 * the build-time PH_CONNECT_OPENPANEL_* env is the fallback so builds that
 * bake it keep working. An empty clientId leaves OpenPanel disabled.
 */
export function resolveOpenPanelConfig(
  runtime: PHConnectOpenPanel | undefined,
  env: OpenPanelBuildEnv,
): ResolvedOpenPanelConfig {
  return {
    clientId: runtime?.clientId || env.PH_CONNECT_OPENPANEL_CLIENT_ID || "",
    apiUrl: runtime?.apiUrl || env.PH_CONNECT_OPENPANEL_API_URL || undefined,
    trackUiEvents:
      runtime?.trackUiEvents ?? env.PH_CONNECT_OPENPANEL_TRACK_UI_EVENTS,
    trackOperations:
      runtime?.trackOperations ?? env.PH_CONNECT_OPENPANEL_TRACK_OPERATIONS,
  };
}
