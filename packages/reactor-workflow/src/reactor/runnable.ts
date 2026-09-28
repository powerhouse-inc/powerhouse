import type {
  PublishedWorkflow,
  WorkflowState,
} from "@powerhousedao/workflow/document-models/workflow";

export interface RunnableDefinition {
  // The draft version the definition was taken at; a run records it.
  version: number;
  trigger: PublishedWorkflow["trigger"];
  steps: PublishedWorkflow["steps"];
  edges: PublishedWorkflow["edges"];
  variables: PublishedWorkflow["variables"];
  policy: PublishedWorkflow["policy"] | undefined;
  // False for a document never published, which runs its draft.
  published: boolean;
}

/** What a trigger arms and a run executes: the published snapshot, or the
 * draft of a document that has none. Design-time reads use the draft. */
export function runnableDefinition(state: WorkflowState): RunnableDefinition {
  // Older documents carry no `published` field at all.
  const published = state.published as PublishedWorkflow | null | undefined;
  const source = published ?? state;
  return {
    version: source.version,
    trigger: source.trigger ?? null,
    steps: source.steps,
    edges: source.edges,
    variables: source.variables,
    policy: source.policy as PublishedWorkflow["policy"] | undefined,
    published: published !== null && published !== undefined,
  };
}
