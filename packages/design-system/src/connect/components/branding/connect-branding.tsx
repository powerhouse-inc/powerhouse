import { createContext, useContext, type PropsWithChildren } from "react";

/**
 * Connect's branding as the components see it: the host app provides it once
 * at its root (images already resolved to data URIs) and the components read
 * it from here instead of reaching into configuration. `icons` are the drive
 * explorer's, which the generic plugin owns; `appName`, `icon` and
 * `homeBackground` are Connect's identity (`connect.branding`). Without a
 * provider every built-in icon renders.
 */
export type ConnectExplorerIcons = {
  /** Local drives without an icon of their own. */
  localDrive?: string | null;
  /** Remote drives without an icon of their own. */
  remoteDrive?: string | null;
  folder?: string | null;
  /** Documents whose type has no icon in `documents`. */
  document?: string | null;
  /** Per document type, e.g. "acme/invoice". */
  documents?: Record<string, string> | null;
};

export type ConnectBranding = {
  appName?: string | null;
  /** The in-app logo (the 64 px app icon). */
  icon?: string | null;
  homeBackground?: string | null;
  icons?: ConnectExplorerIcons | null;
};

const ConnectBrandingContext = createContext<ConnectBranding>({});

export function ConnectBrandingProvider(
  props: PropsWithChildren<{ branding: ConnectBranding | null | undefined }>,
) {
  return (
    <ConnectBrandingContext.Provider value={props.branding ?? {}}>
      {props.children}
    </ConnectBrandingContext.Provider>
  );
}

/** The provided branding; `{}` (built-in look) without a provider. */
export function useConnectBranding(): ConnectBranding {
  return useContext(ConnectBrandingContext);
}

/** The icon for a document of `documentType`: the explorer's icon for that
 * type, else its default document icon, else undefined (the icon the package
 * ships, or the built-in one). */
export function brandedDocumentIcon(
  branding: ConnectBranding,
  documentType: string,
): string | undefined {
  return (
    branding.icons?.documents?.[documentType] ??
    branding.icons?.document ??
    undefined
  );
}
