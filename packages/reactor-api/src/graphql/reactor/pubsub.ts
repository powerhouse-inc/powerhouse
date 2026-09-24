import type {
  DocumentChangeEvent,
  IReactorClient,
  JobResultSummary,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import { PubSub } from "graphql-subscriptions";

const pubSub = new PubSub();

export function getPubSub(): PubSub {
  return pubSub;
}

export type SubscriptionTriggers = {
  DOCUMENT_CHANGES: string;
  JOB_CHANGES: string;
};

export const SUBSCRIPTION_TRIGGERS: SubscriptionTriggers = {
  DOCUMENT_CHANGES: "DOCUMENT_CHANGES",
  JOB_CHANGES: "JOB_CHANGES",
};

export interface DocumentChangesPayload {
  documentChanges: DocumentChangeEvent;
  search: SearchFilter;
  view?: ViewFilter;
}

export interface JobChangesPayload {
  jobChanges: {
    jobId: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    error: string | null;
    result: JobResultSummary | null;
  };
  jobId: string;
  /** Document id used to authorize the subscription; not in the GraphQL event. */
  documentId: string;
}

type Feed = { unsubscribe: () => void; subscribers: number };

// Anonymous callers share one feed; `|` cannot occur in an address or a did:key.
function subjectKey(subject: AuthSubject): string {
  return `${subject.address ?? ""}|${subject.key ?? ""}`;
}

/**
 * The reactor's change feed, read once per distinct subject and shared by that
 * subject's GraphQL subscriptions. Each feed is read as its subject, so the
 * client withholds what that subject may not read; one feed read with no view
 * would gate every subscriber as the host.
 */
export class DocumentChangeFeed {
  readonly #pubSub = new PubSub();
  readonly #feeds = new Map<string, Feed>();

  constructor(private readonly reactorClient: IReactorClient) {}

  subscribe(
    subject: AuthSubject,
  ): AsyncIterableIterator<DocumentChangesPayload> {
    const key = subjectKey(subject);
    const topic = `${SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES}:${key}`;
    const iterator =
      this.#pubSub.asyncIterableIterator<DocumentChangesPayload>(topic);
    this.#acquire(key, topic, subject);

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        this.#release(key);
      }
    };

    return {
      next: () => iterator.next(),
      return: () => {
        release();
        return iterator.return();
      },
      throw: (error: unknown) => {
        release();
        return iterator.throw(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  #acquire(key: string, topic: string, subject: AuthSubject): void {
    const feed = this.#feeds.get(key);
    if (feed) {
      feed.subscribers++;
      return;
    }

    const view: ViewFilter = { subject };
    const unsubscribe = this.reactorClient.subscribe(
      {},
      (event: DocumentChangeEvent) => {
        const payload: DocumentChangesPayload = {
          documentChanges: event,
          search: {},
          view,
        };
        void this.#pubSub.publish(topic, payload);
      },
      view,
    );
    this.#feeds.set(key, { unsubscribe, subscribers: 1 });
  }

  #release(key: string): void {
    const feed = this.#feeds.get(key);
    if (!feed) {
      return;
    }
    feed.subscribers--;
    if (feed.subscribers === 0) {
      this.#feeds.delete(key);
      feed.unsubscribe();
    }
  }
}

const activeJobSubscriptions = new Map<
  string,
  {
    cancel: () => void;
    refCount: number;
  }
>();

export function ensureJobSubscription(
  reactorClient: IReactorClient,
  jobId: string,
): () => void {
  let subscription = activeJobSubscriptions.get(jobId);

  if (!subscription) {
    let isCancelled = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const poll = async () => {
      if (isCancelled) {
        return;
      }

      const jobInfo = await reactorClient.getJobStatus(jobId);
      const payload: JobChangesPayload = {
        jobChanges: {
          jobId: jobInfo.id,
          status: jobInfo.status,
          createdAt: jobInfo.createdAtUtcIso,
          completedAt: jobInfo.completedAtUtcIso ?? null,
          error: jobInfo.error?.message ?? null,
          result: jobInfo.result ?? null,
        },
        jobId,
        documentId: jobInfo.documentId,
      };

      void pubSub.publish(SUBSCRIPTION_TRIGGERS.JOB_CHANGES, payload);

      const isTerminal =
        String(jobInfo.status) === "FAILED" ||
        String(jobInfo.status) === "READ_MODELS_READY" ||
        jobInfo.completedAtUtcIso !== undefined;

      if (!isTerminal && !isCancelled) {
        timeoutId = setTimeout(() => {
          void poll().catch((error) => {
            console.error("Error polling job status:", error);
          });
        }, 1000);
      } else if (isTerminal) {
        activeJobSubscriptions.delete(jobId);
      }
    };

    void poll().catch((error) => {
      console.error("Error starting job polling:", error);
    });

    const cancel = () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };

    subscription = { cancel, refCount: 0 };
    activeJobSubscriptions.set(jobId, subscription);
  }

  subscription.refCount++;

  return () => {
    if (subscription) {
      subscription.refCount--;
      if (subscription.refCount === 0) {
        subscription.cancel();
        activeJobSubscriptions.delete(jobId);
      }
    }
  };
}
