import { lazyComponent } from "../lazy-component.js";

export const Combobox = lazyComponent(() =>
  import("./combobox.impl.js").then((m) => m.Combobox),
);
