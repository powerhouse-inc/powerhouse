import { runLoaderCompatibilityCases } from "../src/evidence/loader-compatibility-probe.js";

const result = await runLoaderCompatibilityCases();
process.stdout.write(`\n__PH_B8_RESULT__${JSON.stringify(result)}\n`);
