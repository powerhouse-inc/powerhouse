import type { ConnectModals } from "@powerhousedao/connect-core/router";
import { getConnectPluginUi } from "@powerhousedao/connect-core/plugins";
import { coreModals, ModalOutlet } from "@powerhousedao/connect-core/router";
import { lazy } from "react";

const CookiesPolicyModal = lazy(() =>
  import("./modals/CookiesPolicyModal.js").then((m) => ({
    default: m.CookiesPolicyModal,
  })),
);
const OpenFileDocumentsModal = lazy(() =>
  import("./modals/OpenFileDocumentsModal.js").then((m) => ({
    default: m.OpenFileDocumentsModal,
  })),
);
// Connect's own, whatever the composition: the consent banner's policy and the
// PWA's open-file picker.
const appModals: ConnectModals = {
  cookiesPolicy: CookiesPolicyModal,
  openFileDocuments: OpenFileDocumentsModal,
};

/** The open modal, in the router so a route's `staticData.modals` can replace it:
 * the active plugins' views over core's. */
export function ConnectModalOutlet() {
  const modals = {
    ...coreModals,
    ...appModals,
    ...getConnectPluginUi().modals,
  };
  return <ModalOutlet modals={modals} />;
}
