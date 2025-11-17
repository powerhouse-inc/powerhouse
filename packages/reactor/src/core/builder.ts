import type { IEventBus } from "#events/interfaces.js";
import { ReactorClient } from "../client/reactor-client.js";
import { JobAwaiter, type IJobAwaiter } from "../shared/awaiter.js";
import { PassthroughSigner } from "../signer/passthrough-signer.js";
import type { ISigner } from "../signer/types.js";
import { DefaultSubscriptionErrorHandler } from "../subs/default-error-handler.js";
import { ReactorSubscriptionManager } from "../subs/react-subscription-manager.js";
import type { IReactorSubscriptionManager } from "../subs/types.js";
import type { IReactor } from "./types.js";

/**
 * Builder class for constructing ReactorClient instances with proper configuration
 */
export class ReactorClientBuilder {
  private reactor?: IReactor;
  private signer?: ISigner;
  private subscriptionManager?: IReactorSubscriptionManager;
  private jobAwaiter?: IJobAwaiter;
  private eventBus?: IEventBus;

  public withReactor(reactor: IReactor, eventBus: IEventBus): this {
    this.reactor = reactor;
    this.eventBus = eventBus;
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

  public build(): ReactorClient {
    if (!this.reactor) {
      throw new Error("Reactor is required to build ReactorClient");
    }

    if (!this.eventBus) {
      throw new Error("Event bus is required to build ReactorClient");
    }

    if (!this.signer) {
      this.signer = new PassthroughSigner();
    }

    // Use default SubscriptionManager with default error handler if not provided
    if (!this.subscriptionManager) {
      this.subscriptionManager = new ReactorSubscriptionManager(
        new DefaultSubscriptionErrorHandler(),
      );
    }

    if (!this.jobAwaiter) {
      this.jobAwaiter = new JobAwaiter(this.eventBus, (jobId, signal) =>
        this.reactor!.getJobStatus(jobId, signal),
      );
    }

    return new ReactorClient(
      this.reactor,
      this.signer,
      this.subscriptionManager,
      this.jobAwaiter,
    );
  }
}
