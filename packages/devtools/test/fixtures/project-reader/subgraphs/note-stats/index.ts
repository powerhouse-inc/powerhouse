import { BaseSubgraph } from "./base.js";
import { schema } from "./schema.js";

export class NoteStatsSubgraph extends BaseSubgraph {
  name = "note-stats";
  typeDefs = schema;
}
