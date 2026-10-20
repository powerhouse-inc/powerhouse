import { DropZoneWrapper } from "@powerhousedao/design-system/connect";
import { GenericDriveExplorer } from "@powerhousedao/powerhouse-vetra-packages/editors";
import {
  useAppModuleById,
  useDefaultAppModule,
} from "@powerhousedao/reactor-browser";
import { useDriveRouteData } from "@powerhousedao/connect-core/router";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { EditorLoader } from "./editor-loader.js";
import { ErrorBoundary } from "@powerhousedao/connect/components/shared";

/** The route's drive's app around `children`, the open document's view;
 * drive apps show their own view while `children` is null. */
export function AppContainer({ children = null }: { children?: ReactNode }) {
  const selectedDrive = useDriveRouteData().drive;

  const app = useAppModuleById(selectedDrive?.header.meta?.preferredEditor);
  const defaultApp = useDefaultAppModule();

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
