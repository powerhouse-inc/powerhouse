'use client';
import {
    ApolloClient,
    InMemoryCache,
    createHttpLink,
    gql,
} from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { jwtDecode } from 'jwt-decode';
import { useEffect } from 'react';
import { create } from 'zustand';
import useWallet from './useWallet';

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

export const authStore = create<AuthStore>((set, get) => ({
    gqlToken: undefined,
    isLoading: true,
    address: '',
    isAuthorized: false,
    sessions: [],
    setGqlToken: (token: string | undefined) => {
        set(state => ({ ...state, gqlToken: token }));
    },
    setIsLoading: (loading: boolean) => {
        set(state => ({ ...state, isLoading: loading }));
    },
    setAddress: (address: string) => {
        set(state => ({ ...state, address }));
    },
    setIsAuthorized: (isAuthorized: boolean) => {
        set(state => ({ ...state, isAuthorized }));
    },
    setSessions: (sessions: Session[]) => {
        set(state => ({ ...state, sessions }));
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
        const localToken = localStorage.getItem('token');
        if (localToken && !gqlToken) {
            setGqlToken(localToken);
        }
    }, [gqlToken, setGqlToken]);
    const httpLink = createHttpLink({
        uri: '/auth',
    });

    const authLink = setContext((_, { headers }) => {
        return {
            headers: {
                ...headers,
                authorization: gqlToken ? `Bearer ${gqlToken}` : '',
            } as Record<string, string>,
        };
    });

    const client = new ApolloClient({
        link: authLink.concat(httpLink),
        cache: new InMemoryCache(),
    });

    const getDrives = async () => {
        const { data, errors } = await client.query<{ drives: string[] }>({
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
            const { data, errors } = await client.query<{
                system: {
                    auth: {
                        me: { address: string };
                        sessions: Session[];
                    };
                };
            }>({
                query: gql`
                    query {
                        system {
                            auth {
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
                        }
                    }
                `,
            });

            if (errors) {
                setAddress('');
                setSessions([]);

                return;
            }

            setAddress(data.system.auth.me.address);
            setSessions(data.system.auth.sessions);
        } catch (e) {
            setAddress('');
            setSessions([]);
        }

        setIsLoading(false);
    };

    const createChallenge = async (address: string) => {
        const { data, errors } = await client.mutate<{
            createChallenge: { nonce: string; message: string };
        }>({
            mutation: gql`mutation { createChallenge(address: "${address}") { nonce, message } }`,
        });

        if (errors) {
            throw new Error(errors[0].message);
        }

        if (!data) {
            throw new Error('No data returned from createChallenge');
        }

        return data.createChallenge;
    };

    const solveChallenge = async (nonce: string, signature: string) => {
        const { data, errors } = await client.mutate<{
            solveChallenge: { token: string };
        }>({
            mutation: gql`mutation { solveChallenge(nonce: "${nonce}", signature: "${signature}") { token } }`,
        });

        if (errors) {
            throw new Error(errors[0].message);
        }

        if (!data) {
            throw new Error('No data returned from solveChallenge');
        }

        return data.solveChallenge.token;
    };

    const createSession = async (
        name: string,
        expiryDurationSeconds: number | null,
        allowedOrigins: string,
    ): Promise<string> => {
        const { data, errors } = await client.mutate<{
            createSession: { token: string };
        }>({
            mutation: gql`mutation { createSession(session: {name: "${name}", expiryDurationSeconds: ${expiryDurationSeconds}, allowedOrigins: "${allowedOrigins}"}) { token } }`,
        });

        if (errors) {
            throw new Error(errors[0].message);
        }

        if (!data) {
            throw new Error('No data returned from createSession');
        }

        await checkAuthValidity();
        return data.createSession.token;
    };

    const revokeSession = async (sessionId: string) => {
        const { data, errors } = await client.mutate<{
            revokeSession: { referenceTokenId: string };
        }>({
            mutation: gql`mutation { revokeSession(sessionId: "${sessionId}") { id } }`,
        });

        if (errors) {
            throw new Error(errors[0].message);
        }

        if (!data) {
            throw new Error('No data returned from revokeSession');
        }

        if (gqlToken) {
            const payload = jwtDecode<{ sessionId: string }>(gqlToken);
            if (sessionId === payload.sessionId) {
                setGqlToken(undefined);
                setAddress('');
                setIsAuthorized(false);
            }
        }
        await checkAuthValidity();
        return data.revokeSession.referenceTokenId;
    };

    const signIn = async () => {
        const address = await connectWallet();

        const { nonce, message } = await createChallenge(address);
        const signature = await signMessage(message);

        const token = await solveChallenge(nonce, signature);
        localStorage.setItem('token', token);
        setGqlToken(token);
        setIsAuthorized(true);
    };

    const signOut = async () => {
        if (!gqlToken) {
            throw new Error('No user token provided');
        }
        const payload = jwtDecode<{ sessionId: string }>(gqlToken);
        if (!payload.sessionId) {
            throw new Error('Token has invalid format');
        }
        await revokeSession(payload.sessionId);
        localStorage.removeItem('token');
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
