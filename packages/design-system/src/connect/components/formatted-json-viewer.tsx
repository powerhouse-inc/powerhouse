import { lazyComponent } from "./lazy-component.js";

export const FormattedJsonViewer = lazyComponent(() =>
  import("./formatted-json-viewer.impl.js").then((m) => m.FormattedJsonViewer),
);
