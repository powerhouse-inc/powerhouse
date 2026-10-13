/**
 * Regenerates the host scalar-binding golden by measuring this build.
 *
 *     pnpm exec tsx test/goldens/regenerate-scalar-bindings.ts
 */
import { writeFileSync } from "node:fs";
import { measureScalarBindings } from "../utils/scalar-matrix.js";

const measurement = await measureScalarBindings();
const path = new URL("./host-scalar-bindings.json", import.meta.url);
writeFileSync(path, `${JSON.stringify(measurement, null, 2)}\n`);
process.stdout.write(
  `wrote ${path.pathname} for ${measurement.declared.length} declared scalars\n`,
);
