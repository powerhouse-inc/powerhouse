import { gql } from "graphql-tag";

export const systemTypeDefs = gql`
  type SystemInfo {
    version: String!
    gitHash: String!
    gitUrl: String
  }

  type Query {
    system: SystemInfo!
  }
`;
