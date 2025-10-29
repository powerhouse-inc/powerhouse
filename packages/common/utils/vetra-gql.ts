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
