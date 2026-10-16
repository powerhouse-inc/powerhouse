export type { DriveSettingsFormSubmitHandler } from "./drive-settings-form.impl.js";
import { lazyComponent } from "../lazy-component.js";

export const DriveSettingsForm = lazyComponent(() =>
  import("./drive-settings-form.impl.js").then((m) => m.DriveSettingsForm),
);
