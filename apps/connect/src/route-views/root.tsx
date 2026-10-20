import { HeadContent } from "@tanstack/react-router";
import { Suspense } from "react";
import { ConnectModalOutlet } from "../components/modal/modals-container.js";
import { LoadingShell } from "../components/prerendered-shell.js";
import { Root } from "../components/root.js";
import { useResetEditorConfigs } from "../hooks/use-reset-editor-configs.js";

const EmptyView = () => null;

/** The root route's view: the document title, and the page under the
 * prerendered shell until the first route renders. */
export function ConnectRoot() {
  useResetEditorConfigs();
  return (
    <>
      <HeadContent />
      <Suspense
        name="RouteRoot"
        fallback={<LoadingShell Fallback={EmptyView} />}
      >
        <Root />
      </Suspense>
      <ConnectModalOutlet />
    </>
  );
}
