import { ModalManager } from "../modal/modal-manager.js";
import { RWATabs } from "../tabs/tabs.js";

export function RWAEditor() {
  return (
    <ModalManager>
      <RWATabs />
    </ModalManager>
  );
}
