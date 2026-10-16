export type {
  RevisionHistoryLegacyProps,
  RevisionHistoryProps,
  RevisionHistoryScopedProps,
} from "./revision-history.impl.js";
import { lazyComponent } from "../lazy-component.js";

export const RevisionHistory = lazyComponent(() =>
  import("./revision-history.impl.js").then((m) => m.RevisionHistory),
);
