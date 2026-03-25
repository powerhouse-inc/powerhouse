import type { AuthContext, AuthService } from "../../services/auth.service.js";
import type { FetchHandler } from "./types.js";

export type AuthFetchMiddleware = (handler: FetchHandler) => FetchHandler;

const authContextMap = new WeakMap<globalThis.Request, AuthContext>();

/** Internal — only `graphql-manager.ts` should call this. */
export function getAuthContext(
  request: globalThis.Request,
): AuthContext | undefined {
  return authContextMap.get(request);
}

export function createAuthFetchMiddleware(
  authService: AuthService,
): AuthFetchMiddleware {
  return (next: FetchHandler): FetchHandler =>
    async (request: globalThis.Request): Promise<globalThis.Response> => {
      const result = await authService.authenticateRequest(request);
      if (result instanceof globalThis.Response) return result;
      authContextMap.set(request, result);
      return next(request);
    };
}
