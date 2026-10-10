import http from "node:http";
import type { AddressInfo } from "node:net";

export type Received = {
  headers: http.IncomingHttpHeaders;
  body: { operationName?: string; query: string; variables?: unknown };
};

export type Reply = { status: number; body: string };

export type StubSwitchboard = {
  /** The reactor GraphQL endpoint. */
  url: string;
  received: Received[];
  close(): Promise<void>;
};

export const DRIVE_TYPE = "powerhouse/document-drive";

export function wireDocument(id: string, documentType: string) {
  return {
    id,
    slug: id,
    name: id,
    documentType,
    state: {
      global:
        documentType === DRIVE_TYPE ? { name: id, icon: null, nodes: [] } : {},
      local: {},
    },
    revisionsList: [{ scope: "global", revision: 1 }],
    createdAtUtcIso: "2026-01-01T00:00:00.000Z",
    lastModifiedAtUtcIso: "2026-01-02T00:00:00.000Z",
  };
}

export function settledJob(documentId: string) {
  return {
    id: `job-${documentId}`,
    documentId,
    status: "READ_READY",
    result: null,
    error: null,
    errorName: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:01.000Z",
    consistencyToken: {
      version: 1,
      createdAtUtcIso: "2026-01-01T00:00:01.000Z",
      coordinates: [],
    },
    meta: { batchId: "batch-1", batchJobIds: [`job-${documentId}`] },
  };
}

export const REMOTE_INFO = {
  storage: {
    engine: "postgres",
    persistence: "server",
    durable: true,
    selfHeal: false,
  },
  workflows: true,
  syncChannels: ["gql"],
};

export function data(value: unknown): Reply {
  return { status: 200, body: JSON.stringify({ data: value }) };
}

/** The drive middleware's refusal of a drive this Switchboard does not hold. */
export function wrongShard(driveId: string): Reply {
  return {
    status: 421,
    body: JSON.stringify({ error: "wrong-shard", driveId }),
  };
}

/** A Switchboard holding `documents` (id -> type); `override` answers first. */
export function switchboard(
  documents: Record<string, string>,
  override?: (received: Received) => Reply | undefined,
): (received: Received) => Reply {
  return (received) => {
    const answer = override?.(received);
    if (answer) {
      return answer;
    }
    const variables = (received.body.variables ?? {}) as Record<
      string,
      unknown
    >;
    switch (received.body.operationName) {
      case "RemoteReactorInfo":
        return data({ inspection: { info: REMOTE_INFO } });
      case "GetDocumentServed":
        return data({
          documentServed: (variables.idOrSlug as string) in documents,
        });
      case "GetDocument": {
        const id = variables.identifier as string;
        if (!(id in documents)) {
          return data({ document: null });
        }
        return data({
          document: { document: wireDocument(id, documents[id]), childIds: [] },
        });
      }
      case "CreateDocument": {
        const header = (
          variables.document as { header: { id: string; documentType: string } }
        ).header;
        return data({
          createDocument: wireDocument(header.id, header.documentType),
        });
      }
      case "MutateDocumentWithOperations": {
        const id = variables.documentIdentifier as string;
        return data({
          mutateDocument: {
            ...wireDocument(id, documents[id]),
            operations: { items: [] },
          },
        });
      }
      case "ExecuteBatch":
        return data({
          executeBatch: {
            jobs: (
              variables.jobs as { key: string; documentIdOrSlug: string }[]
            ).map((job) => ({
              key: job.key,
              job: settledJob(job.documentIdOrSlug),
            })),
          },
        });
      case "FindDocuments":
        return data({
          findDocuments: {
            items: Object.entries(documents)
              .filter(
                ([, type]) =>
                  (variables.search as { type?: string } | undefined)?.type ===
                  type,
              )
              .map(([id, type]) => wireDocument(id, type)),
            hasNextPage: false,
            hasPreviousPage: false,
            cursor: null,
          },
        });
      default:
        throw new Error(`unexpected operation ${received.body.operationName}`);
    }
  };
}

export async function serve(
  reply: (received: Received) => Reply,
): Promise<StubSwitchboard> {
  const received: Received[] = [];
  const instance = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk: Buffer) => (raw += chunk.toString()));
    request.on("end", () => {
      const entry: Received = {
        headers: request.headers,
        body: JSON.parse(raw) as Received["body"],
      };
      received.push(entry);
      let answer: Reply;
      try {
        answer = reply(entry);
      } catch (error) {
        answer = {
          status: 500,
          body: JSON.stringify({ errors: [{ message: String(error) }] }),
        };
      }
      response.writeHead(answer.status, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) =>
    instance.listen(0, "127.0.0.1", resolve),
  );
  const { port } = instance.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/graphql`,
    received,
    close: () =>
      new Promise<void>((resolve) => instance.close(() => resolve())),
  };
}

export function driveIdOf(
  received: readonly Received[],
  operationName: string,
): string | undefined {
  const entry = received.find((r) => r.body.operationName === operationName);
  if (!entry) {
    throw new Error(`${operationName} was not sent`);
  }
  return entry.headers["drive-id"] as string | undefined;
}
