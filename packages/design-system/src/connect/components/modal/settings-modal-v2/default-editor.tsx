import { lazyComponent } from "../../lazy-component.js";

export const DefaultEditor = lazyComponent(() =>
  import("./default-editor.impl.js").then((m) => m.DefaultEditor),
);

export const DefaultEditorSelect = lazyComponent(() =>
  import("./default-editor.impl.js").then((m) => m.DefaultEditorSelect),
);
