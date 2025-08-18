import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  """
  Subgraph definition for SubgraphModule (powerhouse/subgraph)
  """
  type SubgraphModuleState {
    name: String!
    status: StatusType!
  }

  enum StatusType {
    DRAFT
    CONFIRMED
  }

  """
  Queries: SubgraphModule
  """
  type SubgraphModuleQueries {
    getDocument(docId: PHID!, driveId: PHID): SubgraphModule
    getDocuments(driveId: String!): [SubgraphModule!]
  }

  type Query {
    SubgraphModule: SubgraphModuleQueries
  }

  """
  Mutations: SubgraphModule
  """
  type Mutation {
    SubgraphModule_createDocument(name: String!, driveId: String): String

    SubgraphModule_setSubgraphName(
      driveId: String
      docId: PHID
      input: SubgraphModule_SetSubgraphNameInput
    ): Int
    SubgraphModule_setSubgraphStatus(
      driveId: String
      docId: PHID
      input: SubgraphModule_SetSubgraphStatusInput
    ): Int
  }

  """
  Module: BaseOperations
  """
  input SubgraphModule_SetSubgraphNameInput {
    name: String!
  }
  input SubgraphModule_SetSubgraphStatusInput {
    status: StatusType!
  }
`;
