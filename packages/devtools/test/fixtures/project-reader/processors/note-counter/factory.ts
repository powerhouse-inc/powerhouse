import type { IAnalyticsStore } from "./analytics-store.js";
import { NoteCounter } from "./processor.js";

export const noteCounterFactoryBuilder =
  (module: { analyticsStore: IAnalyticsStore }) => () => [
    {
      processor: new NoteCounter(module.analyticsStore),
      filter: {
        branch: ["main"],
        documentId: ["*"],
        documentType: ["fixture/note"],
      },
    },
  ];
