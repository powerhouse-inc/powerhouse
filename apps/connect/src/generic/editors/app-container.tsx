import { DropZoneWrapper } from "@powerhousedao/design-system/connect";
import { GenericDriveExplorer } from "@powerhousedao/powerhouse-vetra-packages/editors";
import {
  useAppModuleById,
  useDefaultAppModule,
} from "@powerhousedao/reactor-browser";
import { useDriveRouteData } from "@powerhousedao/connect-core/router";
import type { ReactNode } from "react";
import { Suspense, useEffect } from "react";
import { EditorLoader } from "./editor-loader.js";
import { ErrorBoundary } from "@powerhousedao/connect/components/shared";

/** Packages load progressively, so a missing drive app is only a finding once
 * it stays missing; the warning fires once per drive. */
const MISSING_APP_GRACE_MS = 3000;
const warnedDrives = new Set<string>();

/**
 * A drive that names a preferred editor no installed package provides falls
 * back to the generic explorer silently otherwise — which reads as "the drive
 * ignores its editor" when the cause is a package that is not composed in
 * (e.g. Workflow Studio without `@powerhousedao/connect/plugins/workflows`).
 */
function useWarnOnMissingDriveApp(
  driveId: string | undefined,
  preferredEditor: string | undefined,
  found: boolean,
): void {
  useEffect(() => {
    if (!driveId || !preferredEditor || found || warnedDrives.has(driveId)) {
      return;
    }
    const timer = setTimeout(() => {
      warnedDrives.add(driveId);
      console.warn(
        `[Connect] Drive "${driveId}" prefers the drive app "${preferredEditor}", but no installed package provides it; showing the generic drive explorer. ` +
          "Install or compose in the package that registers that app (for Workflow Studio: the @powerhousedao/connect/plugins/workflows plugin).",
      );
    }, MISSING_APP_GRACE_MS);
    return () => clearTimeout(timer);
  }, [driveId, preferredEditor, found]);
}

/** The route's drive's app around `children`, the open document's view;
 * drive apps show their own view while `children` is null. */
export function AppContainer({ children = null }: { children?: ReactNode }) {
  const selectedDrive = useDriveRouteData().drive;

  const app = useAppModuleById(selectedDrive?.header.meta?.preferredEditor);
  const defaultApp = useDefaultAppModule();
  useWarnOnMissingDriveApp(
    selectedDrive?.header.id,
    selectedDrive?.header.meta?.preferredEditor,
    app !== undefined,
  );

  if (!selectedDrive) {
    return <EditorLoader />;
  }

  const AppComponent =
    app?.Component ?? defaultApp?.Component ?? GenericDriveExplorer.Component;
  return (
    <ErrorBoundary
      variant="detailed"
      resetKeys={[selectedDrive.header.id]}
      loggerContext={["Connect", "App"]}
    >
      <Suspense fallback={<EditorLoader />}>
        <DropZoneWrapper className="flex h-full flex-col overflow-auto">
          <AppComponent>{children}</AppComponent>
        </DropZoneWrapper>
      </Suspense>
    </ErrorBoundary>
  );
}
