import { useCheckLatestVersion } from "@powerhousedao/connect/hooks";
import "@powerhousedao/connect/i18n";
import { createReactor, useSetSentryUser } from "@powerhousedao/connect/store";
import type { DocumentModelLib } from "document-model";
import { type ReactNode } from "react";

export async function loadComponent(localPackage?: DocumentModelLib) {
  await createReactor(localPackage);
  return {
    default: ({ children }: { children?: ReactNode }) => {
      useSetSentryUser();
      useCheckLatestVersion();
      return children;
    },
  };
}
