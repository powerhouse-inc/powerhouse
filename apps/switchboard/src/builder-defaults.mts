import type { ReactorBuilder } from "@powerhousedao/reactor";
import {
  ChannelScheme,
  type IDocumentModelLoader,
  type ReactorClientBuilder,
  type SignerConfig,
} from "@powerhousedao/reactor";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { getUniqueDocumentModels } from "@powerhousedao/reactor-api";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModels as vetraDocumentModels } from "@powerhousedao/vetra";
import { documentModelDocumentModelModule, type ILogger } from "document-model";

export type SwitchboardReactorDefaultsOptions = {
  /**
   * Additional document models to register alongside switchboard's baseline.
   * The baseline (document-model, drive, reactor-drive) is included unless
   * `includeBaseModels` is `false`; vetra models are included unless
   * `includeVetraModels` is `false`. Duplicates by id are removed via
   * `getUniqueDocumentModels`.
   */
  documentModels?: DocumentModelModule[];
  /** Default true. */
  includeBaseModels?: boolean;
  /** Default true. */
  includeVetraModels?: boolean;
  /**
   * Channel scheme. Defaults to `ChannelScheme.SWITCHBOARD`, which populates
   * `reactorModule.syncModule.syncManager` — required by reactor-api. Set
   * to `false` only if the caller will configure a scheme themselves.
   */
  channelScheme?: ChannelScheme | false;
  /** Defaults to true. Set false when the caller owns SIGINT handling. */
  signalHandlers?: boolean;
  /** Executor tuning. Omit to use the reactor's own defaults. */
  executorConfig?: { maxSkipThreshold?: number };
  /** Wire dynamic document-model loading via HTTP. */
  documentModelLoader?: IDocumentModelLoader;
  logger?: ILogger;
  /**
   * Identity signer (typically from `getRenownSignerConfig`). Applied to the
   * `ReactorClientBuilder`; omit for unsigned operation.
   */
  signer?: SignerConfig;
};

/**
 * Apply switchboard's standard configuration to a reactor + client builder
 * pair. Each piece is opt-out via the options object; defaults mirror what
 * `startSwitchboard` does when building a reactor itself. Mutates both
 * builders in place.
 *
 * Does NOT touch kysely or read models — callers wire those themselves
 * (see `withKysely` / `withReadModelFactory` on the reactor builder).
 */
export function applySwitchboardReactorDefaults(
  reactorBuilder: ReactorBuilder,
  clientBuilder: ReactorClientBuilder,
  options: SwitchboardReactorDefaultsOptions = {},
): void {
  const baseModels =
    options.includeBaseModels !== false
      ? [
          documentModelDocumentModelModule,
          driveDocumentModelModule,
          reactorDriveDocumentModelModule,
        ]
      : [];
  const vetraModels =
    options.includeVetraModels !== false ? vetraDocumentModels : [];
  const extra = options.documentModels ?? [];
  if (baseModels.length || vetraModels.length || extra.length) {
    reactorBuilder.withDocumentModels(
      getUniqueDocumentModels(baseModels, vetraModels, extra),
    );
  }

  const scheme =
    options.channelScheme === undefined
      ? ChannelScheme.SWITCHBOARD
      : options.channelScheme;
  if (scheme !== false) {
    reactorBuilder.withChannelScheme(scheme);
  }

  if (options.signalHandlers !== false) {
    reactorBuilder.withSignalHandlers();
  }

  if (options.executorConfig?.maxSkipThreshold !== undefined) {
    reactorBuilder.withExecutorConfig({
      maxSkipThreshold: options.executorConfig.maxSkipThreshold,
    });
  }

  if (options.documentModelLoader) {
    reactorBuilder.withDocumentModelLoader(options.documentModelLoader);
  }

  if (options.logger) {
    reactorBuilder.withLogger(options.logger);
  }

  if (options.signer) {
    clientBuilder.withSigner(options.signer);
  }
}
