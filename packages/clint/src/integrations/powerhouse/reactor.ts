/**
 * Reactor builder — lazy-loads @powerhousedao/reactor and creates
 * a ReactorClientModule with persistent PGlite storage.
 */

import type { DocumentModelModule } from "document-model";
import type { ReactorClientModule } from "./types.js";

/** Structural type for the @powerhousedao/reactor ReactorBuilder (fluent API). */
interface ReactorBuilderLike {
  withDocumentModelSources(m: DocumentModelModule[]): ReactorBuilderLike;
  withKysely(k: unknown): ReactorBuilderLike;
}

interface ReactorClientBuilderLike {
  withReactorBuilder(r: unknown): ReactorClientBuilderLike;
  /** NOTE(port): the signer lives on the CLIENT builder — v2-required stacks
   * refuse unsigned writes, and the reactor builder's signer does not sign
   * client submissions. */
  withSigner(s: unknown): ReactorClientBuilderLike;
  buildModule(): Promise<ReactorClientModule>;
}

/**
 * Structural shape of the switchboard helpers we call into. Loaded via
 * dynamic import so `@powerhousedao/switchboard` stays an optional peer.
 */
interface SwitchboardServerEntry {
  applySwitchboardReactorDefaults(
    reactorBuilder: unknown,
    clientBuilder: unknown,
    options?: {
      documentModels?: DocumentModelModule[];
      includeBaseModels?: boolean;
      includeVetraModels?: boolean;
      signalHandlers?: boolean;
    },
  ): void;
}

export interface BuildReactorOptions {
  /** Document model modules to register. */
  documentModels: DocumentModelModule[];
  /** Absolute path to the persistent PGlite directory. */
  storagePath: string;
  /**
   * Apply switchboard's reactor wiring so the module can be wrapped with
   * `startSwitchboard` later. Pulls in channel scheme, base document models,
   * the reactor-drive read model, etc. via `@powerhousedao/switchboard`'s
   * `applySwitchboardReactorDefaults`. Leave false for standalone reactors.
   */
  enableSync?: boolean;
}

/**
 * Build a ReactorClientModule with persistent PGlite storage.
 *
 * All imports are lazy — @powerhousedao/reactor and @electric-sql/pglite
 * are optional peer dependencies.
 *
 * PGlite opens an existing database if the directory exists, or creates
 * a new one if it doesn't. This makes the Reactor persistent across
 * CLI restarts — same path, same data.
 */
export async function buildReactor(
  options: BuildReactorOptions,
): Promise<ReactorClientModule> {
  // Ensure the storage directory exists
  const { mkdir } = await import("node:fs/promises");
  await mkdir(options.storagePath, { recursive: true });

  const reactor = (await import("@powerhousedao/reactor")) as unknown as Record<
    string,
    unknown
  >;
  const pgliteMod = (await import("@electric-sql/pglite")) as unknown as Record<
    string,
    unknown
  >;
  const kyselyMod = (await import("kysely")) as unknown as Record<
    string,
    unknown
  >;
  const dialectMod =
    (await import("kysely-pglite-dialect")) as unknown as Record<
      string,
      unknown
    >;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic peer dep
  const ReactorBuilder = reactor.ReactorBuilder as new () => ReactorBuilderLike;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- dynamic peer dep
  const ReactorClientBuilder =
    reactor.ReactorClientBuilder as new () => ReactorClientBuilderLike;
  const PGlite = pgliteMod.PGlite as new (path: string) => unknown;
  const Kysely = kyselyMod.Kysely as new (opts: {
    dialect: unknown;
  }) => unknown;
  const PGliteDialect = dialectMod.PGliteDialect as new (
    pglite: unknown,
  ) => unknown;

  const pglite = new PGlite(options.storagePath);
  const kysely = new Kysely({ dialect: new PGliteDialect(pglite) });

  // NOTE(port): the modern stack creates documents v2-required by default and
  // refuses unsigned writes (UNSIGNED_REQUIRED); the embedded reactor signs
  // with a fresh local key, same posture as reactor-monitor's provision.
  const { createLocalSigner } = await import("./local-signer.js");
  const signer = await createLocalSigner();

  const reactorBuilder = new ReactorBuilder().withKysely(kysely);
  const clientBuilder = new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(signer);

  if (options.enableSync) {
    // Switchboard owns the standard reactor wiring (channel scheme, base
    // + vetra document models, executor config, etc.). We opt out of signal
    // handlers because ph-clint manages SIGINT itself. The reactor-drive
    // read model + projection are skipped for now — ph-clint doesn't expose
    // its kysely to switchboard yet, so that subgraph stays disabled. See
    // `createReactorDriveProjection` in `@powerhousedao/switchboard/server`
    // for adding it later.
    const sw =
      (await import("@powerhousedao/switchboard/server")) as unknown as SwitchboardServerEntry;
    sw.applySwitchboardReactorDefaults(reactorBuilder, clientBuilder, {
      documentModels: options.documentModels,
      signalHandlers: false,
    });
  } else {
    // Standalone reactor: register only the document models ph-clint needs.
    const sharedMod =
      (await import("@powerhousedao/shared/document-drive")) as unknown as Record<
        string,
        unknown
      >;
    const docModelMod = (await import("document-model")) as unknown as Record<
      string,
      unknown
    >;
    const driveDocumentModelModule =
      sharedMod.driveDocumentModelModule as DocumentModelModule;
    const documentModelDocumentModelModule =
      docModelMod.documentModelDocumentModelModule as DocumentModelModule;
    reactorBuilder.withDocumentModelSources([
      documentModelDocumentModelModule,
      driveDocumentModelModule,
      ...options.documentModels,
    ]);
  }

  return clientBuilder.buildModule();
}
