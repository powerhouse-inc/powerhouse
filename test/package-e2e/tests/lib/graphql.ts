const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001";

export async function graphql<T>(
  path: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SWITCHBOARD_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new Error(
      `GraphQL error at ${path}:\n${body.errors.map((e) => e.message).join("\n")}`,
    );
  }
  if (!body.data) {
    throw new Error(`GraphQL response missing data at ${path}`);
  }
  return body.data;
}

export async function createRemoteDrive(name: string): Promise<{
  id: string;
  slug: string;
  url: string;
}> {
  const data = await graphql<{
    DocumentDrive: { createDocument: { id: string; slug: string } };
  }>(
    "/graphql/document-drive",
    `mutation Create($name: String!) {
       DocumentDrive { createDocument(name: $name) { id slug } }
     }`,
    { name },
  );
  const { id, slug } = data.DocumentDrive.createDocument;
  return { id, slug, url: `${SWITCHBOARD_URL}/d/${id}` };
}

export interface DocumentOperationRecord {
  index: number;
  hash: string;
  timestampUtcMs: string;
  action: {
    type: string;
    input: Record<string, unknown>;
    scope: string;
  };
}

export async function getDocumentOperations(
  documentId: string,
): Promise<DocumentOperationRecord[]> {
  const data = await graphql<{
    documentOperations: { items: DocumentOperationRecord[]; totalCount: number };
  }>(
    "/graphql",
    `query Ops($id: String!) {
       documentOperations(filter: { documentId: $id, scopes: ["global"] }) {
         items {
           index
           hash
           timestampUtcMs
           action { type input scope }
         }
         totalCount
       }
     }`,
    { id: documentId },
  );
  return data.documentOperations.items;
}
