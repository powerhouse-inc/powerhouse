// Shim for @/components/providers/embed-provider: never embedded.
const embedState = {
  isEmbedded: false,
  hideSideNav: false,
  hideLogoInBuilder: false,
  hideFlowNameInBuilder: false,
  hideExportAndImportFlow: false,
  disableNavigationInBuilder: false,
  hideFolders: false,
  sdkVersion: undefined as string | undefined,
  predefinedConnectionName: undefined as string | undefined,
  hideHomeButtonInBuilder: false,
  emitHomeButtonClickedEvent: false,
  homeButtonIcon: "logo" as const,
  hideDuplicateFlow: false,
  hideProjectSettings: false,
};

export type EmbedState = typeof embedState;

export function useEmbedding(): { embedState: EmbedState } {
  return { embedState };
}

export function useNewWindow(): (url: string) => void {
  return (url) => window.open(url, "_blank", "noopener,noreferrer");
}
