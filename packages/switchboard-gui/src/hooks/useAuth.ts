import { jwtDecode } from "jwt-decode";
import useWallet from "./useWallet.js";
import { create } from "zustand";
import {
  ApolloClient,
  InMemoryCache,
  createHttpLink,
  gql,
} from "@apollo/client";
import { useEffect } from "preact/hooks";
import { setContext } from "@apollo/client/link/context";
// import { env } from '../../env';

export interface Session {
  id: string;
  createdAt: Date;
  createdBy: string;
  referenceExpiryDate?: Date;
  referenceTokenId?: string;
  isUserCreated?: boolean;
  name?: string;
  revokedAt?: Date;
  allowedOrigins?: string;
}

interface AuthStore {
  gqlToken: string | undefined;
  isLoading: boolean;
  address: string;
  isAuthorized: boolean;
  sessions: Session[];
  setGqlToken: (token: string | undefined) => void;
  setIsLoading: (loading: boolean) => void;
  setAddress: (address: string) => void;
  setIsAuthorized: (isAuthorized: boolean) => void;
  setSessions: (sessions: Session[]) => void;
}

export const authStore = create<AuthStore>((set) => ({
  gqlToken: undefined,
  isLoading: true,
  address: "",
  isAuthorized: false,
  sessions: [],
  setGqlToken: (token: string | undefined) => {
    set((state) => ({ ...state, gqlToken: token }));
  },
  setIsLoading: (loading: boolean) => {
    set((state) => ({ ...state, isLoading: loading }));
  },
  setAddress: (address: string) => {
    set((state) => ({ ...state, address }));
  },
  setIsAuthorized: (isAuthorized: boolean) => {
    set((state) => ({ ...state, isAuthorized }));
  },
  setSessions: (sessions: Session[]) => {
    set((state) => ({ ...state, sessions }));
  },
}));

const useAuth = () => {
  const { connectWallet, signMessage } = useWallet();
  const {
    gqlToken,
    setGqlToken,
    setIsLoading,
    setAddress,
    setIsAuthorized,
    setSessions,
  } = authStore();
  useEffect(() => {
    const localToken = localStorage.getItem("token");
    if (localToken && !gqlToken) {
      setGqlToken(localToken);
    }
  }, []);

  // const NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST = env(
  //   "NEXT_PUBLIC_SWITCHBOARD_GRAPHQL_HOST"
  // );

  const httpLink = createHttpLink({
    uri: "/system",
  });

  /* eslint-disable */

  const authLink = setContext((_, { headers }) => {
    return {
      headers: {
        ...headers,
        authorization: gqlToken ? `Bearer ${gqlToken}` : "",
      },
    };
  });

  const systemClient = new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache(),
  });

  const authHttpLink = createHttpLink({
    uri: "/auth",
  });

  const client = new ApolloClient({
    link: authLink.concat(authHttpLink),
    cache: new InMemoryCache(),
  });

  const getDrives = async () => {
    const { data, errors } = await systemClient.query({
      query: gql`
        query {
          drives
        }
      `,
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    return data.drives;
  };

  const checkAuthValidity = async () => {
    try {
      const { data, errors } = await client.query({
        query: gql`
          query {
            me {
              address
            }
            sessions {
              id
              createdAt
              createdBy
              referenceExpiryDate
              referenceTokenId
              isUserCreated
              name
              revokedAt
              allowedOrigins
            }
          }
        `,
      });

      if (errors) {
        setAddress("");
        setSessions([]);

        return;
      }

      setAddress(data.me.address);
      setSessions(data.sessions);
    } catch (e) {
      setAddress("");
      setSessions([]);
    }

    setIsLoading(false);
  };

  const createChallenge = async (address: string) => {
    const { data, errors } = await client.mutate({
      mutation: gql`mutation { createChallenge(address: "${address}") { nonce, message } }`,
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    return data.createChallenge;
  };

  const solveChallenge = async (nonce: string, signature: string) => {
    const { data, errors } = await client.mutate({
      mutation: gql`mutation { solveChallenge(nonce: "${nonce}", signature: "${signature}") { token } }`,
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    return data.solveChallenge.token;
  };

  const createSession = async (
    name: string,
    expiryDurationSeconds: number | null,
    allowedOrigins: string,
  ): Promise<string> => {
    const { data, errors } = await client.mutate({
      mutation: gql`mutation { createSession(session: {name: "${name}", expiryDurationSeconds: ${expiryDurationSeconds}, allowedOrigins: "${allowedOrigins}"}) { token } }`,
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    checkAuthValidity();
    return data.createSession.token as string;
  };

  const revokeSession = async (sessionId: string) => {
    const { data, errors } = await client.mutate({
      mutation: gql`mutation { revokeSession(sessionId: "${sessionId}") { id } }`,
    });

    if (errors) {
      throw new Error(errors[0].message);
    }

    if (gqlToken) {
      const payload = jwtDecode(gqlToken) as { sessionId?: string } | undefined;
      if (sessionId === payload?.sessionId) {
        setGqlToken(undefined);
        setAddress("");
        setIsAuthorized(false);
      }
    }
    checkAuthValidity();
    return data.value?.revokeSession?.referenceTokenId;
  };

  const signIn = async () => {
    const address = await connectWallet();

    const { nonce, message } = await createChallenge(address);
    const signature = await signMessage(message);

    const token = await solveChallenge(nonce, signature);
    localStorage.setItem("token", token);
    setGqlToken(token);
    setIsAuthorized(true);
  };

  const signOut = async () => {
    if (!gqlToken) {
      throw new Error("No user token provided");
    }
    const payload = jwtDecode(gqlToken) as { sessionId?: string } | undefined;
    if (!payload?.sessionId) {
      throw new Error("Token has invalid format");
    }
    await revokeSession(payload.sessionId);
    localStorage.removeItem("token");
  };

  return {
    checkAuthValidity,
    signIn,
    signOut,
    createSession,
    revokeSession,
    getDrives,
  };
};

export default useAuth;
