import type { RequestHandler } from "express";
import { verifyAuthBearerToken } from "@renown/sdk/node";

interface PluginConfig {
  /** Public origin of this registry (used as JWT `aud`). */
  publicUrl: string;
}

interface RemoteUser {
  name: string | undefined;
  groups: string[];
  real_groups: string[];
  error?: string;
}

interface AnonymousRemoteUser {
  name: undefined;
  groups: string[];
  real_groups: string[];
  error?: string;
}

interface ApiJWTHelpers {
  createAnonymousRemoteUser: () => AnonymousRemoteUser;
  createRemoteUser: (name: string, groups: string[]) => RemoteUser;
}

interface PluginParams {
  // verdaccio supplies more, we just need logger; treat as opaque otherwise.
  logger: {
    debug: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
  };
}

const RENOWN_ALGS = new Set(["ES256", "ES256K", "EdDSA"]);

/**
 * Decode the JWT header and return its `alg`, or null on parse failure.
 * Pure peek — no signature check. Used to short-circuit non-renown bearer
 * tokens (e.g. RS256 from npmjs) before they reach the renown SDK, which
 * would otherwise log a noisy `console.error` for the unsupported algorithm.
 */
function peekAlg(token: string): string | null {
  try {
    const headerB64 = token.split(".")[0];
    if (!headerB64) return null;
    const headerStr = Buffer.from(headerB64, "base64url").toString("utf8");
    const header = JSON.parse(headerStr) as { alg?: unknown };
    return typeof header.alg === "string" ? header.alg : null;
  } catch {
    return null;
  }
}

class RenownAuthPlugin {
  constructor(
    private cfg: PluginConfig,
    private params: PluginParams,
  ) {}

  /**
   * Provided to verdaccio's auth subsystem. When this method is present on
   * an installed auth plugin, verdaccio's `Auth.apiJWTmiddleware()` returns
   * THIS handler instead of its built-in JWT verifier. We set
   * `req.remote_user` directly — no HMAC secret synchronization with
   * verdaccio, no JWT swap.
   */
  apiJWTmiddleware(helpers: ApiJWTHelpers): RequestHandler {
    return (req, _res, next) => {
      // Mirror verdaccio's stock apiJWTmiddleware behavior: pause the
      // request stream while we do async auth work, resume via the next
      // callback. Without this the body keeps flowing during the await
      // and chunks land in nowhere — verdaccio's body parser then sees a
      // shorter-than-content-length payload and rejects with HTTP 400
      // "request size did not match content length".
      req.pause();
      const resume = () => {
        req.resume();
        next();
      };

      const reqWithUser = req as unknown as {
        remote_user?: RemoteUser | AnonymousRemoteUser;
        headers: { authorization?: string };
      };
      const setAnon = () => {
        reqWithUser.remote_user = helpers.createAnonymousRemoteUser();
      };

      const header = req.headers.authorization;
      if (!header || !header.startsWith("Bearer ")) {
        setAnon();
        return resume();
      }
      const token = header.slice("Bearer ".length).trim();
      if (!token) {
        setAnon();
        return resume();
      }

      const alg = peekAlg(token);
      if (alg && !RENOWN_ALGS.has(alg)) {
        setAnon();
        return resume();
      }

      void (async () => {
        let verified: Awaited<ReturnType<typeof verifyAuthBearerToken>>;
        try {
          verified = await verifyAuthBearerToken(token, {
            audience: this.cfg.publicUrl,
          });
        } catch {
          setAnon();
          return resume();
        }
        if (!verified) {
          setAnon();
          return resume();
        }
        const subject = verified.verifiableCredential?.credentialSubject;
        const address =
          typeof subject?.address === "string"
            ? subject.address.toLowerCase()
            : null;
        if (!address) {
          setAnon();
          return resume();
        }
        reqWithUser.remote_user = helpers.createRemoteUser(address, [
          "$authenticated",
          "renown",
        ]);
        this.params.logger.debug(
          { address },
          "[auth-renown] authenticated @{address}",
        );
        resume();
      })();
    };
  }

  /**
   * Required by IPluginAuth. We don't use Basic auth — Renown is bearer-only.
   * Returning false delegates to the next plugin in the chain (typically
   * htpasswd during the migration grace period).
   */
  authenticate(
    _user: string,
    _password: string,
    cb: (err: Error | null, user?: false) => void,
  ): void {
    cb(null, false);
  }

  /**
   * Read access. Verdaccio also evaluates package-level `access:` rules from
   * the config, so this hook is permissive by default and lets `access: $all`
   * (or whatever is configured per-package) drive the actual decision.
   */
  allow_access(
    _user: RemoteUser,
    _pkg: unknown,
    cb: (err: Error | null, allow: boolean) => void,
  ): void {
    cb(null, true);
  }

  /**
   * Publish access. Permits any authenticated user (Renown or htpasswd).
   * Per-scope rules can be layered on later via package config or by
   * extending this method.
   */
  allow_publish(
    user: RemoteUser,
    _pkg: unknown,
    cb: (err: Error | null, allow: boolean) => void,
  ): void {
    const groups = Array.isArray(user?.real_groups) ? user.real_groups : [];
    cb(null, groups.includes("$authenticated"));
  }
}

/**
 * Verdaccio's plugin loader instantiates plugins by calling the module's
 * default export with `(config, params)`. The factory returns the plugin
 * instance.
 */
export default function pluginFactory(
  config: PluginConfig,
  params: PluginParams,
): RenownAuthPlugin {
  return new RenownAuthPlugin(config, params);
}

export { RenownAuthPlugin };
