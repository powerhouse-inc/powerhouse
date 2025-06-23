declare namespace Express {
  export interface Request {
    user?: {
      address: string;
      chainId: number;
      networkId: string;
    };
    auth_enabled?: boolean;
    admins?: string[];
    users?: string[];
    guests?: string[];
  }
}
