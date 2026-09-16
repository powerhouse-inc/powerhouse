// Context handed to a piece's connection check. The framework has no
// checkConnection hook: auth.validate({auth, server}) is the whole contract.
import { throwingStub, withTouchTracking } from "./stubs.js";
import type { AuthValidationServerContext } from "@powerhousedao/pieces-framework";

export interface CheckConnectionContextOptions {
  auth?: unknown;
  // apiUrl / publicUrl when the host serves them; mintOidcToken always throws,
  // since no reactor mints tokens for a piece's validate().
  server?: Omit<AuthValidationServerContext, "mintOidcToken">;
  onTouch?: (member: string) => void;
}

export interface BuiltApCheckConnectionContext {
  auth: unknown;
  server: AuthValidationServerContext;
}

export interface CheckConnectionContextHandle {
  context: BuiltApCheckConnectionContext;
  // Top-level members the check read; `UNDOCUMENTED:<name>` marks unknown reads.
  touched: ReadonlySet<string>;
}

export function buildCheckConnectionContext(
  options: CheckConnectionContextOptions = {},
): CheckConnectionContextHandle {
  const touched = new Set<string>();
  const base: Record<string, unknown> = {
    auth: options.auth,
    server: options.server
      ? {
          ...options.server,
          mintOidcToken: throwingStub("server.mintOidcToken"),
        }
      : throwingStub("server"),
  };
  const context = withTouchTracking(base, touched, options.onTouch);
  return {
    context: context as unknown as BuiltApCheckConnectionContext,
    touched,
  };
}
