import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { buildSubgraphSchema } from "@apollo/subgraph";
import {
  REACTOR_DRIVE_SUBGRAPH_NAME,
  reactorDriveDocumentModelModule,
  reactorDriveSubgraphTypeDefs,
} from "@powerhousedao/reactor-drive";
import { kebabCase } from "change-case";
import { getNamedType, type GraphQLObjectType } from "graphql";
import { describe, expect, it } from "vitest";
import {
  buildSubgraphSchemaModule,
  getDocumentModelSchemaName,
} from "../src/utils/create-schema.js";

/**
 * Every subgraph schema is assembled together with the GraphQL types of all
 * registered document models (keep-first dedupe, document models first). The
 * reactor-drive document model is named "ReactorDrive", so a subgraph type of
 * that name is silently replaced by the document-model type and the paged
 * listing (`reactorDrive { rootNodes }`) disappears from the schema.
 */
describe("reactor-drive subgraph schema", () => {
  const driveModel =
    reactorDriveDocumentModelModule as unknown as DocumentModelModule;

  function buildDriveSubgraphSchema() {
    return buildSubgraphSchema([
      buildSubgraphSchemaModule([driveModel], {}, reactorDriveSubgraphTypeDefs),
    ]);
  }

  it("keeps rootNodes on the type reactorDrive returns", () => {
    const schema = buildDriveSubgraphSchema();
    const field = schema.getQueryType()?.getFields().reactorDrive;
    expect(field).toBeDefined();
    const type = getNamedType(field!.type) as GraphQLObjectType;
    expect(Object.keys(type.getFields())).toEqual(
      expect.arrayContaining(["id", "name", "rootNodes"]),
    );
  });

  it("does not reuse the GraphQL type name of the reactor-drive document model", () => {
    const docModelTypeName = getDocumentModelSchemaName(
      driveModel.documentModel.global,
    );
    const subgraphTypeNames = reactorDriveSubgraphTypeDefs.definitions
      .map((d) => ("name" in d && d.name ? d.name.value : undefined))
      .filter((n): n is string => n !== undefined && n !== "Query");
    expect(subgraphTypeNames).not.toContain(docModelTypeName);
  });

  it("registers under a name the drive's document-model subgraph does not use", () => {
    // DocumentModelSubgraph is named kebabCase(model name) = "reactor-drive";
    // subgraphs are keyed by name, so a same-named subgraph replaces it and
    // the ReactorDrive document mutations vanish from the schema.
    const docModelSubgraphName = kebabCase(
      driveModel.documentModel.global.name,
    );
    expect(REACTOR_DRIVE_SUBGRAPH_NAME).toMatch(/^[a-z][a-z-]+$/);
    expect(REACTOR_DRIVE_SUBGRAPH_NAME).not.toBe(docModelSubgraphName);
  });
});
