import {
  EventBus,
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "@powerhousedao/reactor";

type DropRule = {
  matches: (event: JobWriteReadyEvent) => boolean;
  resolve: (event: JobWriteReadyEvent) => void;
};

/** Drops one matching JOB_WRITE_READY before any subscriber sees it. */
export class DroppingEventBus extends EventBus {
  private readonly rules: DropRule[] = [];

  dropWriteReadyFor(documentId: string): Promise<JobWriteReadyEvent> {
    return new Promise((resolve) => {
      this.rules.push({
        matches: (event) =>
          event.operations.some((op) => op.context.documentId === documentId),
        resolve,
      });
    });
  }

  override async emit(type: number, data: unknown): Promise<void> {
    if (type === ReactorEventTypes.JOB_WRITE_READY) {
      const event = data as JobWriteReadyEvent;
      const index = this.rules.findIndex((rule) => rule.matches(event));
      if (index !== -1) {
        const [rule] = this.rules.splice(index, 1);
        rule!.resolve(event);
        return;
      }
    }
    return super.emit(type, data);
  }
}
