import { ModalManager } from "./modal-manager.js";
import { RWATabs } from "./tabs.js";

export function RWAEditor() {
  return (
    <ModalManager>
      <RWATabs />
    </ModalManager>
  );
}
