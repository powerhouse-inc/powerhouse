import { DropZoneWrapper } from "@powerhousedao/design-system/connect";
import { GenericDriveExplorer } from "@powerhousedao/powerhouse-vetra-packages/editors";
import {
  DriveProvider,
  useAppModuleById,
  useDefaultAppModule,
  useDispatch,
} from "@powerhousedao/reactor-browser";
import { useDriveRouteData } from "@powerhousedao/connect-core/router";
import type { ReactNode } from "react";
import { Suspense, useMemo } from "react";
import { EditorLoader } from "./editor-loader.js";
import { ErrorBoundary } from "@powerhousedao/connect/components/shared";

/** The route's drive's app around `children`, the open document's view;
 * drive apps show their own view while `children` is null. */
export function AppContainer({ children = null }: { children?: ReactNode }) {
  const { drive: selectedDrive, folder, documentId } = useDriveRouteData();

  const app = useAppModuleById(selectedDrive?.header.meta?.preferredEditor);
  const defaultApp = useDefaultAppModule();
  const [, dispatch] = useDispatch(selectedDrive);
  const nodeId = documentId ?? folder?.id;
  // The drive app's useSelected* read this; opening goes through the router.
  const context = useMemo(
    () => selectedDrive && { drive: selectedDrive, dispatch, folder, nodeId },
    [selectedDrive, dispatch, folder, nodeId],
  );

  if (!selectedDrive || !context) {
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
        <DriveProvider value={context}>
          <DropZoneWrapper className="flex h-full flex-col overflow-auto">
            <AppComponent document={selectedDrive} dispatch={dispatch}>
              {children}
            </AppComponent>
          </DropZoneWrapper>
        </DriveProvider>
      </Suspense>
    </ErrorBoundary>
  );
}
