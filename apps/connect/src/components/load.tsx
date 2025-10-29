import {
  createReactor,
  useCheckLatestVersion,
  useSetSentryUser,
  useSubscribeToVetraPackages,
} from "@powerhousedao/connect";
import { lazy, type ReactNode } from "react";
import "../i18n/index.js";

export const Load = lazy(async () => {
  await createReactor();
  return {
    default: ({ children }: { children?: ReactNode }) => {
      useSubscribeToVetraPackages();
      useSetSentryUser();
      useCheckLatestVersion();
      return children;
    },
  };
});
