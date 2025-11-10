import { useContext } from "react";
import { ModalContext } from "./modal-context.js";

export const useModal = () => {
  const context = useContext(ModalContext);
  return context;
};
