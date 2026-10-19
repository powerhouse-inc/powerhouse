import { expectTypeOf } from "vitest";
import { AnalyticsSubgraph } from "../../src/graphql/analytics-subgraph.js";
import { AuthSubgraph } from "../../src/graphql/auth/subgraph.js";
import type {
  DocumentModelSubgraph,
  DocumentModelSubgraphClass,
} from "../../src/graphql/document-model-subgraph.js";
import { InspectionSubgraph } from "../../src/graphql/inspection/subgraph.js";
import { PackagesSubgraph } from "../../src/graphql/packages/subgraph.js";
import { ReactorSubgraph } from "../../src/graphql/reactor/subgraph.js";
import type { SubgraphCheck } from "../../src/graphql/subgraph-schema.js";
import { SystemSubgraph } from "../../src/graphql/system/subgraph.js";

const analytics: SubgraphCheck<typeof AnalyticsSubgraph> = true;
const auth: SubgraphCheck<typeof AuthSubgraph> = true;
const inspection: SubgraphCheck<typeof InspectionSubgraph> = true;
const packages: SubgraphCheck<typeof PackagesSubgraph> = true;
const reactor: SubgraphCheck<typeof ReactorSubgraph> = true;
const system: SubgraphCheck<typeof SystemSubgraph> = true;
const documentModel: SubgraphCheck<typeof DocumentModelSubgraph> = true;
const generatedDocumentModel: SubgraphCheck<DocumentModelSubgraphClass> = true;

expectTypeOf([
  analytics,
  auth,
  inspection,
  packages,
  reactor,
  system,
  documentModel,
  generatedDocumentModel,
]).toEqualTypeOf<true[]>();

expectTypeOf(AnalyticsSubgraph.subgraphName).toEqualTypeOf<"analytics">();
expectTypeOf(AuthSubgraph.subgraphName).toEqualTypeOf<"auth">();
expectTypeOf(InspectionSubgraph.subgraphName).toEqualTypeOf<"inspection">();
expectTypeOf(PackagesSubgraph.subgraphName).toEqualTypeOf<"packages">();
expectTypeOf(ReactorSubgraph.subgraphName).toEqualTypeOf<"r">();
expectTypeOf(SystemSubgraph.subgraphName).toEqualTypeOf<"system">();
