import { AppContainer } from "../editors/app-container.js";
import { DocumentEditorContainer } from "../editors/document-editor-container.js";
import { DriveIcon } from "@powerhousedao/connect/components/shared";
import {
  DriveAuthGate,
  HomeScreen,
  HomeScreenAddDriveItem,
  HomeScreenItem,
} from "@powerhousedao/design-system/connect";
import {
  logout,
  makeDriveSlug,
  preloadDrive,
  setSelectedDrive,
  useAppModuleById,
  useIsAddDriveEnabled,
  useLinkProps,
  getDriveName,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { Outlet } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useDriveRouteData } from "@powerhousedao/connect-core/router";
import { getRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import { useDriveAuthGate, useVisibleDrives } from "./use-drive-auth-gate.js";
import { useOpenRenownLogin } from "../hooks/use-renown-login.js";

/** Connect's home: the drives, and adding one. A custom home builds on its
 * parts: ConnectHomeScreen, HomeDriveItem, HomeAddDriveItem, useVisibleDrives. */
export function Home() {
  const drives = useVisibleDrives();
  return (
    <ConnectHomeScreen>
      {drives?.map((drive) => (
        <HomeDriveItem key={drive.header.id} drive={drive} />
      ))}
      <HomeAddDriveItem />
    </ConnectHomeScreen>
  );
}

/** The home's grid, on the configured `home.background`. */
export function ConnectHomeScreen({ children }: { children?: ReactNode }) {
  const homeBackground = getRuntimeConfig().connect.home?.background;
  return <HomeScreen homeBackground={homeBackground}>{children}</HomeScreen>;
}

/** The add-drive tile, or nothing where adding drives is turned off. */
export function HomeAddDriveItem() {
  return useIsAddDriveEnabled() ? <HomeScreenAddDriveItem /> : null;
}

/** Connect's drive layout: the drive app around the open document, or the
 * sign-in gate when the drive's remote refuses the user. */
export function DriveLayout() {
  const { gate, dismiss } = useDriveAuthGate();
  const openLogin = useOpenRenownLogin();
  const { documentId } = useDriveRouteData();
  if (gate) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <DriveAuthGate
          mode={gate}
          onLogin={openLogin}
          onLogout={() => void logout()}
          onClose={dismiss}
        />
      </div>
    );
  }
  return <AppContainer>{documentId ? <Outlet /> : null}</AppContainer>;
}

/** Connect's node route: the open document's editor. */
export function NodeView() {
  const { documentId } = useDriveRouteData();
  return documentId ? (
    <DocumentEditorContainer documentId={documentId} />
  ) : null;
}

/** A drive's card: its name, its app and a link that opens it. */
export function HomeDriveItem({ drive }: { drive: DocumentDriveDocument }) {
  const editorModule = useAppModuleById(drive.header.meta?.preferredEditor);
  const description = editorModule?.config.name || "Drive Explorer App";
  const link = useLinkProps({ driveSlug: makeDriveSlug(drive) }, () =>
    setSelectedDrive(drive),
  );
  return (
    <HomeScreenItem
      title={getDriveName(drive)}
      description={description}
      icon={<DriveIcon drive={drive} />}
      href={link.href}
      aria-current={link["aria-current"]}
      onClick={link.onClick}
      onPreload={() => preloadDrive(drive)}
    />
  );
}
