// The REAL generic compound runner, by source path: the fixture project's
// node resolution (no "source" condition) would otherwise load host-core's
// dist, a second module instance that needs a build.
export * from "../../../../../src/runners/compound.js";
