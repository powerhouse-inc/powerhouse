// Design-time channel to the workflow-runtime subgraph: piece descriptors
// and dynamic option resolution. Not document-model coupled.
import { CORE_FORMS, type BlockForm, type BlockFormProp } from "./ui/forms.js";

const DEFAULT_RUNTIME_URL = "http://localhost:4001/graphql/workflow-runtime";

function runtimeUrl(): string {
  const override = (globalThis as { WORKFLOW_RUNTIME_URL?: string })
    .WORKFLOW_RUNTIME_URL;
  return override ?? DEFAULT_RUNTIME_URL;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(runtimeUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) throw new Error(body.errors[0].message);
  if (!body.data) throw new Error("Empty GraphQL response");
  return body.data;
}

interface BlockDescriptorResult {
  workflowRuntime: {
    blockDescriptor: {
      displayName: string;
      action: {
        displayName: string;
        requireAuth: boolean;
        props: BlockFormProp[];
      };
    } | null;
  };
}

const formCache = new Map<string, Promise<BlockForm | null>>();

export function getBlockForm(blockType: string): Promise<BlockForm | null> {
  const core = CORE_FORMS[blockType] as BlockForm | undefined;
  if (core) return Promise.resolve(core);
  let cached = formCache.get(blockType);
  if (!cached) {
    cached = gql<BlockDescriptorResult>(
      `query Descriptor($blockType: String!) {
        workflowRuntime { blockDescriptor(blockType: $blockType) }
      }`,
      { blockType },
    ).then((data) => {
      const descriptor = data.workflowRuntime.blockDescriptor;
      if (!descriptor) return null;
      return {
        title: `${descriptor.displayName} · ${descriptor.action.displayName}`,
        requireAuth: descriptor.action.requireAuth,
        props: descriptor.action.props,
      };
    });
    formCache.set(blockType, cached);
    cached.catch(() => formCache.delete(blockType));
  }
  return cached;
}

interface BlockOptionsResult {
  workflowRuntime: { blockOptions: unknown };
}

export async function loadBlockOptions(
  blockType: string,
  propName: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const data = await gql<BlockOptionsResult>(
    `query Options($blockType: String!, $propName: String!, $input: Unknown) {
      workflowRuntime { blockOptions(blockType: $blockType, propName: $propName, input: $input) }
    }`,
    { blockType, propName, input },
  );
  return data.workflowRuntime.blockOptions;
}
