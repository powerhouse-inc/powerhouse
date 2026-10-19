import { lazyComponent } from "../lazy-component.js";

export const AddLocalDriveForm = lazyComponent(() =>
  import("./add-local-drive-form.impl.js").then((m) => m.AddLocalDriveForm),
);
