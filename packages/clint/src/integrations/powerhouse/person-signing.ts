import type { BearerTokenProvider } from "@powerhousedao/reactor-browser/graphql-client";
import type { ISigner } from "@powerhousedao/shared/document-model";
import type {
  AnyRegistry,
  DocumentRegistry,
  LazySigner,
  RemoteReactorConfig,
} from "./types.js";

/** The person's session the own reactor opens at its first write. */
type PersonSession = {
  actionSigner: ISigner;
  bearer(o?: { expiresIn?: number; aud?: string }): Promise<string>;
};

/**
 * `remote` with the person who runs the Cli as its writer when it names no
 * signer: their active identity on this computer (their Renown login, else
 * their pseudonym, made at the first signature), a session labelled `label`
 * (the Cli's name) kept in their home folder and made known at the
 * switchboard `switchboardBase`. Once a write opened it, requests bear that
 * session unless `remote` names a token. Renown's signing code loads at the
 * first write only; a Cli that never writes opens no session.
 */
export function withPersonSigning<R extends DocumentRegistry = AnyRegistry>(
  remote: RemoteReactorConfig<R>,
  o: { label: string; dataDir: string; switchboardBase: string },
): RemoteReactorConfig<R> {
  if (remote.signer) return remote;
  let session: Promise<PersonSession> | undefined;
  const open = (): Promise<PersonSession> => {
    session ??= (async () => {
      const { openSession } = await import("@renown/sdk/identity");
      try {
        return await openSession({
          dataDir: o.dataDir,
          label: o.label,
          place: "home",
          interactive: false,
          target: { url: o.switchboardBase },
        });
      } catch (error) {
        const cause = (error as { cause?: unknown }).cause;
        throw new Error(
          `${o.label} cannot sign as the person who runs it: ${error instanceof Error ? error.message : String(error)}${cause instanceof Error ? ` (${cause.message})` : ""}`,
          { cause: error },
        );
      }
    })();
    session.catch(() => {
      session = undefined;
    });
    return session;
  };
  const signer: LazySigner = {
    ready: () => true,
    open: async () => (await open()).actionSigner,
  };
  const tokenProvider: BearerTokenProvider = async () =>
    session ? (await session).bearer({ expiresIn: 600 }) : undefined;
  return {
    ...remote,
    signer,
    ...(remote.tokenProvider ? {} : { tokenProvider }),
  };
}
