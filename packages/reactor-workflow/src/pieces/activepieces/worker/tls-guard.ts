// Certificate checks a piece cannot switch off for the worker.
//
// Activepieces pieces published on npm bundle an old pieces-common whose
// FetchHttpClient sets process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" before
// every request (pieces-framework's own copy has the line removed; the
// bundles inline theirs). The variable is process-wide: while it is "0",
// every TLS connection Node opens without an explicit rejectUnauthorized
// skips certificate verification, Google's and the bank's included.
//
// Node consults the variable only when a connection does not say: tls.connect
// takes rejectUnauthorized from its options and falls back to the variable.
// So the guard gives every connection an explicit rejectUnauthorized: true
// unless its caller asked otherwise. fetch (undici), https, and the HTTP
// clients pieces bundle all connect through tls.connect, so the variable no
// longer decides anything, without timing races. A caller that explicitly
// asks for rejectUnauthorized: false (an HTTP piece's "ignore SSL errors")
// still gets it: that is a choice, not pollution.
import tls from "node:tls";

type Connect = typeof tls.connect;

/** Defaults rejectUnauthorized to true on every tls.connect; returns the undo. */
export function installTlsGuard(): () => void {
  const original: Connect = tls.connect;
  const guarded = function (this: unknown, ...args: unknown[]) {
    // tls.connect(options[, cb]), (port[, host][, options][, cb]) or (path[, options][, cb])
    const index = args.findIndex(
      (a) => a !== null && typeof a === "object" && !Array.isArray(a),
    );
    if (index === -1) {
      const at = args.findIndex((a) => typeof a === "function");
      args.splice(at === -1 ? args.length : at, 0, {
        rejectUnauthorized: true,
      });
    } else {
      const options = args[index] as { rejectUnauthorized?: boolean };
      if (options.rejectUnauthorized === undefined) {
        args[index] = { ...options, rejectUnauthorized: true };
      }
    }
    return (original as (...a: unknown[]) => tls.TLSSocket).apply(this, args);
  } as Connect;
  tls.connect = guarded;
  return () => {
    if (tls.connect === guarded) tls.connect = original;
  };
}
