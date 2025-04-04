import { Context } from "#graphql/types.js";

export interface SessionInput {
  name: string;
  allowedOrigins: string[];
  expiresAt?: string;
}

export interface SessionOutput {
  session: Session;
  token: string;
}

export interface Session {
  id: string;
  userId: string;
  address: string;
  name?: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  allowedOrigins: string;
  referenceExpiryDate: string;
  referenceTokenId: string;
  isUserCreated: boolean;
  createdBy: string;
}

export interface Challenge {
  id: string;
  nonce: string;
  signature: string;
  message: string;
}

export type AuthContext = Context & {
  session: Session;
};
