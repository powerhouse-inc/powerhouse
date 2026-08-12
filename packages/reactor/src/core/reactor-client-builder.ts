import type { ISigner } from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { ConsoleLogger } from "document-model";
import { ReactorClient } from "../client/reactor-client.js";
import type { IReadGate } from "../decision/read-gate.js";
import {
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
} from "../decision/read-gate.js";
import type { IEventBus } from "../events/interfaces.js";
import type { IDocumentModelLoader } from "../registry/interfaces.js";
import { JobAwaiter, type IJobAwaiter } from "../shared/awaiter.js";
import { PassthroughSigner } from "../signer/passthrough-signer.js";
import type {
  SignatureVerificationHandler,
  SignerConfig,
} from "../signer/types.js";
import type { IDocumentIndexer, IDocumentView } from "../storage/interfaces.js";
import { DefaultSubscriptionErrorHandler } from "../subs/default-error-handler.js";
import { ReactorSubscriptionManager } from "../subs/react-subscription-manager.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import type { ReactorBuilder } from "./reactor-builder.js";
import type {
  InProcessReactorClientModule,
  InProcessReactorModule,
  IReactor,
} from "./types.js";

/**
 * Builder class for constructing ReactorClient instances with proper configuration
 */
export class ReactorClientBuilder {
  private logger?: ILogger;
  private reactorBuilder?: ReactorBuilder;
  private reactor?: IReactor;
  private eventBus?: IEventBus;
  private documentIndexer?: IDocumentIndexer;
  private documentView?: IDocumentView;
  private signer?: ISigner;
  private signatureVerifier?: SignatureVerificationHandler;
  private subscriptionManager?: IReactorSubscriptionManager;
  private jobAwaiter?: IJobAwaiter;
  private documentModelLoader?: IDocumentModelLoader;
  private readGate?: IReadGate;

  /**
   * Sets the logger for the ReactorClient.
   * @param logger - The logger to use.
   * @returns The ReactorClientBuilder instance.
   */
  public withLogger(logger: ILogger): this {
    this.logger = logger;
    return this;
  }

  /**
   * Either this or withReactor must be set.
   */
  public withReactorBuilder(reactorBuilder: ReactorBuilder): this {
    if (this.reactor) {
      throw new Error("Reactor is already set");
    }

    this.reactorBuilder = reactorBuilder;
    return this;
  }

  /**
   * Either this or withReactorBuilder must be set.
   */
  public withReactor(
    reactor: IReactor,
    eventBus: IEventBus,
    documentIndexer: IDocumentIndexer,
    documentView: IDocumentView,
  ): this {
    if (this.reactorBuilder) {
      throw new Error("ReactorBuilder is already set");
    }

    this.reactor = reactor;
    this.eventBus = eventBus;
    this.documentIndexer = documentIndexer;
    this.documentView = documentView;
    return this;
  }

  /**
   * Sets the signer configuration for signing and verifying actions.
   *
   * @param config - Either an ISigner for signing only, or a SignerConfig for both signing and verification
   */
  public withSigner(config: ISigner | SignerConfig): this {
    if ("signer" in config) {
      this.signer = config.signer;
      this.signatureVerifier = config.verifier;
    } else {
      this.signer = config;
    }
    return this;
  }

  public withSubscriptionManager(
    subscriptionManager: IReactorSubscriptionManager,
  ): this {
    this.subscriptionManager = subscriptionManager;
    return this;
  }

  public withJobAwaiter(jobAwaiter: IJobAwaiter): this {
    this.jobAwaiter = jobAwaiter;
    return this;
  }

  public withDocumentModelLoader(loader: IDocumentModelLoader): this {
    this.documentModelLoader = loader;
    return this;
  }

  /**
   * Overrides how reads are gated. A client built from a ReactorBuilder derives
   * this from that reactor's flags; one built from `withReactor` cannot, because
   * it is handed no flags and no registry, so it gates on the policy alone
   * unless a gate is supplied here.
   */
  public withReadGate(readGate: IReadGate): this {
    this.readGate = readGate;
    return this;
  }

  /**
   * The gate this reactor's flags call for. Below authEnforcement there is no
   * model to enforce -- the registered one ignores the auth scope -- so the
   * policy is evaluated on its own, which is what reads did before the model
   * existed.
   */
  private resolveReadGate(
    reactorModule: InProcessReactorModule | undefined,
    documentView: IDocumentView,
  ): IReadGate {
    if (!reactorModule) {
      return new BareReadGate();
    }

    const model = readDecisionModel(
      reactorModule.featureFlags,
      reactorModule.documentModelRegistry,
    );
    return model === undefined
      ? new BareReadGate()
      : new ModelReadGate(
          model,
          documentView,
          reactorModule.operationIndex,
          this.logger,
        );
  }

  public async build(): Promise<ReactorClient> {
    const module = await this.buildModule();
    return module.client;
  }

  public async buildModule(): Promise<InProcessReactorClientModule> {
    if (!this.logger) {
      this.logger = new ConsoleLogger(["reactor-client"]);
    }

    let reactor: IReactor;
    let eventBus: IEventBus;
    let documentIndexer: IDocumentIndexer;
    let documentView: IDocumentView;
    let reactorModule: InProcessReactorModule | undefined;

    if (this.reactorBuilder) {
      if (this.signatureVerifier) {
        this.reactorBuilder.withSignatureVerifier(this.signatureVerifier);
      }
      if (this.documentModelLoader) {
        this.reactorBuilder.withDocumentModelLoader(this.documentModelLoader);
      }
      reactorModule = await this.reactorBuilder.buildModule();
      reactor = reactorModule.reactor;
      eventBus = reactorModule.eventBus;
      documentIndexer = reactorModule.documentIndexer;
      documentView = reactorModule.documentView;
    } else if (
      this.reactor &&
      this.eventBus &&
      this.documentIndexer &&
      this.documentView
    ) {
      reactor = this.reactor;
      eventBus = this.eventBus;
      documentIndexer = this.documentIndexer;
      documentView = this.documentView;
      reactorModule = undefined;
    } else {
      throw new Error(
        "Either ReactorBuilder or (Reactor + EventBus + DocumentIndexer + DocumentView) is required",
      );
    }

    const signer = this.signer ?? new PassthroughSigner();

    const subscriptionManager =
      this.subscriptionManager ??
      reactorModule?.subscriptionManager ??
      new ReactorSubscriptionManager(new DefaultSubscriptionErrorHandler());

    const jobAwaiter =
      this.jobAwaiter ??
      new JobAwaiter(eventBus, (jobId, signal) =>
        reactor.getJobStatus(jobId, signal),
      );

    const client = new ReactorClient(
      this.logger,
      reactor,
      signer,
      subscriptionManager,
      jobAwaiter,
      documentIndexer,
      documentView,
      this.readGate ?? this.resolveReadGate(reactorModule, documentView),
    );

    return {
      client,
      reactor,
      eventBus,
      documentIndexer,
      documentView,
      signer,
      subscriptionManager,
      jobAwaiter,
      reactorModule,
    };
  }
}
