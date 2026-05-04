import { useCheckLatestVersion } from "@powerhousedao/connect/hooks";
import "@powerhousedao/connect/i18n";
import { createReactor, useSetSentryUser } from "@powerhousedao/connect/store";
import {
  detectReactorPgMajor,
  seedPendingPgVersion,
} from "@powerhousedao/connect/utils";
import type { DocumentModelLib } from "document-model";
import { type ReactNode } from "react";
import { applyConnectBranding, loadRuntimeConfig } from "../runtime-config.js";

export async function loadComponent(localPackage?: DocumentModelLib) {
  await seedPendingPgVersion();
  await detectReactorPgMajor();
  const runtimeConfig = await loadRuntimeConfig();
  applyConnectBranding(runtimeConfig);
  await createReactor(localPackage);
  return {
    default: ({ children }: { children?: ReactNode }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useSetSentryUser();
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useCheckLatestVersion();
      return children;
    },
  };
}
