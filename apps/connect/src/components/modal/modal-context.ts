import React from "react";
import type { ModalContextValue } from "@powerhousedao/connect";

export const ModalContext = React.createContext<ModalContextValue>({
  showModal: () => {},
  closeModal: () => {},
});
