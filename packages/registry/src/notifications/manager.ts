import type {
  NotificationChannel,
  PublishEvent,
  UnpublishEvent,
} from "./types.js";

export class NotificationManager implements NotificationChannel {
  #channels: NotificationChannel[];

  constructor(channels: NotificationChannel[]) {
    this.#channels = channels;
  }

  notifyPublish(event: PublishEvent): void {
    for (const channel of this.#channels) {
      channel.notifyPublish(event);
    }
  }

  notifyUnpublish(event: UnpublishEvent): void {
    for (const channel of this.#channels) {
      channel.notifyUnpublish(event);
    }
  }
}
