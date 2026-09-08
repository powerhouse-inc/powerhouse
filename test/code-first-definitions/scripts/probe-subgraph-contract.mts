import { runSubgraphContractCases } from "../src/evidence/subgraph-contract-probe.js";

process.stdout.write(JSON.stringify(await runSubgraphContractCases()));
