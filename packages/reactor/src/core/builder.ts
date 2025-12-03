import type { IEventBus } from "#events/interfaces.js";
import { ReactorClient } from "../client/reactor-client.js";
import { JobAwaiter, type IJobAwaiter } from "../shared/awaiter.js";
import { PassthroughSigner } from "../signer/passthrough-signer.js";
import type { ISigner } from "../signer/types.js";
import type { IDocumentIndexer } from "../storage/interfaces.js";
import { DefaultSubscriptionErrorHandler } from "../subs/default-error-handler.js";
import { ReactorSubscriptionManager } from "../subs/react-subscription-manager.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import type { ReactorBuilder } from "./reactor-builder.js";
import type { IReactor, ReactorClientModule, ReactorModule } from "./types.js";

/**
 * Builder class for constructing ReactorClient instances with proper configuration
 */
export class ReactorClientBuilder {
  private reactorBuilder?: ReactorBuilder;
  private reactor?: IReactor;
  private eventBus?: IEventBus;
  private documentIndexer?: IDocumentIndexer;
  private signer?: ISigner;
  private subscriptionManager?: IReactorSubscriptionManager;
  private jobAwaiter?: IJobAwaiter;

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
  ): this {
    if (this.reactorBuilder) {
      throw new Error("ReactorBuilder is already set");
    }

    this.reactor = reactor;
    this.eventBus = eventBus;
    this.documentIndexer = documentIndexer;
    return this;
  }

  public withSigner(signer: ISigner): this {
    this.signer = signer;
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

  public async build(): Promise<ReactorClient> {
    const module = await this.buildModule();
    return module.client;
  }

  public async buildModule(): Promise<ReactorClientModule> {
    let reactor: IReactor;
    let eventBus: IEventBus;
    let documentIndexer: IDocumentIndexer;
    let reactorModule: ReactorModule | undefined;

    if (this.reactorBuilder) {
      reactorModule = await this.reactorBuilder.buildModule();
      reactor = reactorModule.reactor;
      eventBus = reactorModule.eventBus;
      documentIndexer = reactorModule.documentIndexer;
    } else if (this.reactor && this.eventBus && this.documentIndexer) {
      reactor = this.reactor;
      eventBus = this.eventBus;
      documentIndexer = this.documentIndexer;
      reactorModule = undefined;
    } else {
      throw new Error(
        "Either ReactorBuilder or (Reactor + EventBus + DocumentIndexer) is required",
      );
    }

    const signer = this.signer ?? new PassthroughSigner();

    const subscriptionManager =
      this.subscriptionManager ??
      new ReactorSubscriptionManager(new DefaultSubscriptionErrorHandler());

    const jobAwaiter =
      this.jobAwaiter ??
      new JobAwaiter(eventBus, (jobId, signal) =>
        reactor.getJobStatus(jobId, signal),
      );

    const client = new ReactorClient(
      reactor,
      signer,
      subscriptionManager,
      jobAwaiter,
      documentIndexer,
    );

    return {
      client,
      reactor,
      eventBus,
      documentIndexer,
      signer,
      subscriptionManager,
      jobAwaiter,
      reactorModule,
    };
  }
}
