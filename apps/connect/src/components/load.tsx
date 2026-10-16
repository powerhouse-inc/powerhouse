import { useCheckLatestVersion } from "@powerhousedao/connect/hooks";
import "@powerhousedao/connect/i18n";
import { createReactor, useSetSentryUser } from "@powerhousedao/connect/store";
import {
  detectMigrationMajor,
  detectReactorPgMajor,
  seedPendingPgVersion,
} from "@powerhousedao/connect/utils";
import type { PHStore } from "@powerhousedao/reactor-browser";
import { initTheme } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";
import { type ReactNode } from "react";
import { loadRuntimeConfig } from "../runtime-config.js";

export async function loadComponent(
  localPackage: DocumentModelLib | undefined,
  store: PHStore,
) {
  await seedPendingPgVersion();
  await Promise.all([detectReactorPgMajor(), detectMigrationMajor()]);
  await loadRuntimeConfig();
  await createReactor(localPackage, store);
  return {
    default: ({ children }: { children?: ReactNode }) => {
      initTheme();
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useSetSentryUser();
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useCheckLatestVersion();
      return children;
    },
  };
}
