import { PubSub } from "graphql-subscriptions";
import type {
  DocumentChangeEvent,
  IReactorClient,
  SearchFilter,
  ViewFilter,
} from "@powerhousedao/reactor";

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
    result: NonNullable<unknown>;
  };
  jobId: string;
}

let globalDocumentUnsubscribe: (() => void) | null = null;
let documentSubscriberCount = 0;

export function ensureGlobalDocumentSubscription(
  reactorClient: IReactorClient,
): () => void {
  if (documentSubscriberCount === 0) {
    globalDocumentUnsubscribe = reactorClient.subscribe(
      {},
      (event: DocumentChangeEvent) => {
        const payload: DocumentChangesPayload = {
          documentChanges: event,
          search: {},
          view: undefined,
        };
        void pubSub.publish(SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES, payload);
      },
    );
  }

  documentSubscriberCount++;

  return () => {
    documentSubscriberCount--;
    if (documentSubscriberCount === 0 && globalDocumentUnsubscribe) {
      globalDocumentUnsubscribe();
      globalDocumentUnsubscribe = null;
    }
  };
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
          result: jobInfo.result ?? {},
        },
        jobId,
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
