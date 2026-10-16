export type {
  AddPublicDriveFormProps,
  AddRemoteDriveInput,
} from "./add-remote-drive-form.impl.js";
import { lazyComponent } from "../lazy-component.js";

export const AddRemoteDriveForm = lazyComponent(() =>
  import("./add-remote-drive-form.impl.js").then((m) => m.AddRemoteDriveForm),
);
