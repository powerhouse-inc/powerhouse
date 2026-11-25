import type { IAnalyticsStore } from "./analytics-store.js";

export class NoteCounter {
  constructor(readonly analyticsStore: IAnalyticsStore) {}
}
