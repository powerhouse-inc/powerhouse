import { createContext, useContext, type PropsWithChildren } from "react";

/**
 * Connect's branding as the components see it: the host app resolves
 * `connect.branding` (paths already turned into data URIs) and provides it
 * once at its root; the components read it from here instead of reaching
 * into configuration. Without a provider every built-in icon renders.
 */
export type ConnectBrandingIcons = {
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
  icons?: ConnectBrandingIcons | null;
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

/** The icon for a document of `documentType`: its type's icon, else the
 * branding's default document icon, else undefined (the built-in icon). */
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
