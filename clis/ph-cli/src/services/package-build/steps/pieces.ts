import {
  buildPieces,
  externalDependencyVersions,
  pieceListPath,
  syncDistManifest,
} from "@powerhousedao/shared/build-pieces";
import { existsSync } from "node:fs";
import { readPackage } from "read-pkg";
import { build as tsdownBuild } from "tsdown";
import { markOfferedRoutes } from "../../../utils/offered-routes-manifest.js";
import type { StandardBuildStep } from "./context.js";
import { stageLogger } from "./stage-logger.js";

// After the node build: it cleans <outDir>/node, where the pieces land. The
// built list is the gate, so a `bundle:` entry is validated with no piece dir.
export const piecesStep: StandardBuildStep = {
  id: "pieces",
  run: async (ctx) => {
    const { projectRoot, outDir, pieces, session, trace, detection, findings } =
      ctx;
    const stage = session.stage();
    if (!existsSync(pieceListPath({ projectRoot, outDir: stage }))) return;
    const pkg = findings.pkg ?? (await readPackage({ cwd: projectRoot }));
    const customLogger = stageLogger(ctx);
    findings.built = await buildPieces(
      { projectRoot, outDir, writeTo: stage, pieces: [...pieces] },
      {
        name: pkg.name,
        version: pkg.version,
        license: typeof pkg.license === "string" ? pkg.license : undefined,
      },
      {
        bundle: (config) => tsdownBuild({ ...config, customLogger }),
        trace,
        cache: detection,
      },
    );
  },
};

export const distManifestStep: StandardBuildStep = {
  id: "dist-manifest",
  run: ({ projectRoot, pieces, session, findings }) => {
    syncDistManifest(
      { projectRoot, outDir: session.stage(), pieces: [...pieces] },
      findings.built,
      externalDependencyVersions(findings.external.values()),
    );
    return Promise.resolve();
  },
};

export const offeredRoutesStep: StandardBuildStep = {
  id: "offered-routes",
  run: ({ session, findings }) => {
    markOfferedRoutes(session.stage(), findings.offersRoutes);
    return Promise.resolve();
  },
};
