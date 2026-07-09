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
import { documentModelDocumentModelModule, type ILogger } from "document-model";

export type SwitchboardReactorDefaultsOptions = {
  // Extra models registered alongside the baseline (document-model, drive,
  // reactor-drive). Pass vetra models here in studio/dev. Deduped by id.
  documentModels?: DocumentModelModule[];
  /** Default true. */
  includeBaseModels?: boolean;
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
  const extra = options.documentModels ?? [];
  if (baseModels.length || extra.length) {
    reactorBuilder.withDocumentModels(
      getUniqueDocumentModels(baseModels, extra),
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
