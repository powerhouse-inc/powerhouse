const gql = (sdl: TemplateStringsArray) => sdl.join("");

export const schema = gql`
  type NoteStatsSubgraphQueries {
    count(driveId: String!): Int!
  }

  type NoteStatsSubgraphMutations {
    reset(driveId: String!, hard: Boolean = false): Boolean
  }

  type Query {
    noteStats: NoteStatsSubgraphQueries!
    version: String
  }

  type Mutation {
    noteStats: NoteStatsSubgraphMutations!
  }
`;
