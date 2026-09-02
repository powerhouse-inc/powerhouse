// Shim for @/features/connections/api/app-connections: connections stay
// managed by the classic editor; the AP builder sees none.
export interface ShimConnection {
  id: string;
  externalId: string;
  displayName: string;
  pieceName: string;
  pieceVersion?: string;
}

export const appConnectionsApi = {
  list(_request: unknown): Promise<{
    data: ShimConnection[];
    next: null;
    previous: null;
  }> {
    return Promise.resolve({ data: [], next: null, previous: null });
  },
};
