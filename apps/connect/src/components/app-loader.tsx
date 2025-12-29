import {
  App,
  AppSkeleton,
  CookieBanner,
  ModalsContainer,
} from "@powerhousedao/connect/components";
import { useCheckLatestVersion } from "@powerhousedao/connect/hooks";
import "@powerhousedao/connect/i18n";
// import { useSubscribeToVetraPackages } from "@powerhousedao/connect/services";
import { createReactor, useSetSentryUser } from "@powerhousedao/connect/store";
import type { DocumentModelLib } from "document-model";
import { StrictMode, Suspense, use, type ReactNode } from "react";

interface IConnectProps {
  localPackage?: Promise<DocumentModelLib>;
  packages: string[];
}

export const Load = ({
  children,
  localPackage,
  packages,
  onLocalPackageUpdate,
}: { children?: ReactNode } & IConnectProps & {
    onLocalPackageUpdate?: (
      callback: (localPackage: DocumentModelLib) => void,
    ) => void;
  }) => {
  // await createReactor();
  const resolvedLocalPackage = localPackage ? use(localPackage) : undefined;
  use(
    createReactor({
      localPackage: resolvedLocalPackage,
      packages,
      onLocalPackageUpdate,
    }),
  );
  // useSubscribeToVetraPackages();
  useSetSentryUser();
  useCheckLatestVersion();
  return children;
};

export const AppLoader = ({
  localPackage,
  packages,
  onLocalPackageUpdate,
}: IConnectProps & {
  onLocalPackageUpdate?: (
    callback: (localPackage: DocumentModelLib) => void,
  ) => void;
}) => (
  <StrictMode>
    <Suspense fallback={<AppSkeleton />} name="AppLoader">
      <Load
        localPackage={localPackage}
        packages={packages}
        onLocalPackageUpdate={onLocalPackageUpdate}
      >
        <App />
        <ModalsContainer />
      </Load>
    </Suspense>
    <Suspense name="CookieBanner">
      <CookieBanner />
    </Suspense>
  </StrictMode>
);
