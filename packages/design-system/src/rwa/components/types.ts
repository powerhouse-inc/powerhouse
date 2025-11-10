import type { modals } from "./modal-components.js";

export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
  [K in ModalType]: React.ComponentProps<Modals[K]>;
};

export type MapModalProps<T> = {
  [K in keyof T]: Omit<T[K], "open" | "onOpenChange">;
};

export type ModalProps = MapModalProps<ModalPropsMapping>;

export type ModalContextValue = {
  showModal: <T extends ModalType>(modalType: T, props?: ModalProps[T]) => void;
  closeModal: () => void;
};
