import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  OFFERED_ROUTES_MODULE,
  syncProjectConnectRoutes,
} from "../../../utils/sync-connect-routes.js";
import type { StandardBuildStep } from "./context.js";

export const connectRoutesStep: StandardBuildStep = {
  id: "connect-routes",
  run: async ({ projectRoot, findings }) => {
    // Project routes type-check against the tree generated from them.
    await syncProjectConnectRoutes(projectRoot);
    // Connect reads the manifest's flag to load the package's routes.
    findings.offersRoutes = existsSync(
      join(projectRoot, OFFERED_ROUTES_MODULE),
    );
  },
};
