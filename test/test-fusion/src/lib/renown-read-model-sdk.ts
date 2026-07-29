import type {
  SdkFunctionWrapper,
  SubgraphSdkFactory,
} from "@powerhousedao/reactor-browser/graphql-client";

// A hand-written stand-in for a generated subgraph SDK. A real app runs
// graphql-codegen against <switchboard>/graphql/renown-read-model and passes
// the generated `getSdk` to `client.subgraph` instead - the shape below is
// exactly what that plugin emits, minus the generated types.

export type ReadRenownUser = {
  documentId: string;
  ethAddress: string | null;
};

export type RenownReadModelSdk = {
  Service: () => Promise<{ _service: { sdl: string } }>;
  RenownUsers: (
    ethAddresses: string[],
  ) => Promise<{ renownUsers: ReadRenownUser[] }>;
};

const SERVICE = `
  query Service {
    _service {
      sdl
    }
  }
`;

const RENOWN_USERS = `
  query RenownUsers($ethAddresses: [String!]) {
    renownUsers(input: { ethAddresses: $ethAddresses }) {
      documentId
      ethAddress
    }
  }
`;

const unwrapped: SdkFunctionWrapper = (action) => action();

export const getRenownReadModelSdk: SubgraphSdkFactory<RenownReadModelSdk> = (
  client,
  withWrapper,
) => {
  const wrap = withWrapper ?? unwrapped;
  return {
    Service: () =>
      wrap(
        (requestHeaders) =>
          client.request<{ _service: { sdl: string } }>({
            document: SERVICE,
            requestHeaders,
          }),
        "Service",
        "query",
      ),
    RenownUsers: (ethAddresses) =>
      wrap(
        (requestHeaders) =>
          client.request<{ renownUsers: ReadRenownUser[] }>({
            document: RENOWN_USERS,
            variables: { ethAddresses },
            requestHeaders,
          }),
        "RenownUsers",
        "query",
        { ethAddresses },
      ),
  };
};
