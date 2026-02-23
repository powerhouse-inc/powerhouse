import { useCheckLatestVersion } from "@powerhousedao/connect/hooks";
import "@powerhousedao/connect/i18n";
import { useSubscribeToVetraPackages } from "@powerhousedao/connect/services";
import { createReactor, useSetSentryUser } from "@powerhousedao/connect/store";
import { type ReactNode } from "react";

export async function loadComponent() {
  await createReactor();
  return {
    default: ({ children }: { children?: ReactNode }) => {
      useSubscribeToVetraPackages();
      useSetSentryUser();
      useCheckLatestVersion();
      return children;
    },
  };
}
