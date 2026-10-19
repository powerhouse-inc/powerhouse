import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { expectTypeOf } from "vitest";
import type { ReactorDriveSubgraph } from "../../src/drive-subgraph.js";
import type { PrivacySubgraph } from "../../src/privacy-subgraph.js";
import type { createWorkflowRuntimeSubgraph } from "../../src/workflow/subgraph.js";

expectTypeOf<
  SubgraphCheck<typeof ReactorDriveSubgraph>
>().toEqualTypeOf<true>();
expectTypeOf<SubgraphCheck<typeof PrivacySubgraph>>().toEqualTypeOf<true>();
expectTypeOf<
  SubgraphCheck<ReturnType<typeof createWorkflowRuntimeSubgraph>>
>().toEqualTypeOf<true>();
