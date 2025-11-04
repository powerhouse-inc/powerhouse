import { GraphQLClient, gql } from "graphql-request";

interface VetraDocument {
  id: string;
  state: {
    githubUrl: string;
  };
}

interface GetDocumentsResponse {
  VetraPackage: {
    getDocuments: VetraDocument[];
  };
}

export interface VetraDocumentInfo {
  id: string;
  githubUrl: string;
}

interface SetPackageGithubUrlResponse {
  VetraPackage_setPackageGithubUrl: number;
}

interface CreateDocumentResponse {
  VetraPackage_createDocument: string;
}

export async function getVetraDocuments(
  graphqlEndpoint: string,
  driveId: string,
): Promise<VetraDocumentInfo[]> {
  const client = new GraphQLClient(graphqlEndpoint, {
    fetch,
  });

  const query = gql`
    query GetDocuments($driveId: String!) {
      VetraPackage {
        getDocuments(driveId: $driveId) {
          id
          state {
            githubUrl
          }
        }
      }
    }
  `;

  const response = await client.request<GetDocumentsResponse>(query, {
    driveId,
  });

  return response.VetraPackage.getDocuments.map((doc) => ({
    id: doc.id,
    githubUrl: doc.state.githubUrl,
  }));
}

export async function setPackageGithubUrl(
  graphqlEndpoint: string,
  driveId: string,
  documentId: string,
  url: string,
): Promise<number> {
  const client = new GraphQLClient(graphqlEndpoint, {
    fetch,
  });

  const mutation = gql`
    mutation SetPackageGithubUrl(
      $driveId: String
      $docId: PHID
      $input: VetraPackage_SetPackageGithubUrlInput!
    ) {
      VetraPackage_setPackageGithubUrl(
        driveId: $driveId
        docId: $docId
        input: $input
      )
    }
  `;

  const response = await client.request<SetPackageGithubUrlResponse>(mutation, {
    driveId,
    docId: documentId,
    input: {
      url,
    },
  });

  return response.VetraPackage_setPackageGithubUrl;
}

export async function createVetraDocument(
  graphqlEndpoint: string,
  driveId: string,
  name = "vetra-package",
): Promise<string> {
  const client = new GraphQLClient(graphqlEndpoint, {
    fetch,
  });

  const mutation = gql`
    mutation CreateDocument($driveId: String, $name: String) {
      VetraPackage_createDocument(driveId: $driveId, name: $name)
    }
  `;

  const response = await client.request<CreateDocumentResponse>(mutation, {
    driveId,
    name,
  });

  return response.VetraPackage_createDocument;
}
