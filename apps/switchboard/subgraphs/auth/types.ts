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
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}
