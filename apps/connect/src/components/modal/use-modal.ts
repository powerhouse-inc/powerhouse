import { ModalContext } from "@powerhousedao/connect";
import { useContext } from "react";

export const useModal = () => {
  const context = useContext(ModalContext);
  return context;
};
