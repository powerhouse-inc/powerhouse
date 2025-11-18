import { createContext } from "react";
import type { ModalContextValue } from "./types.js";

export const ModalContext = createContext<ModalContextValue>({
  showModal: () => {},
  closeModal: () => {},
});
