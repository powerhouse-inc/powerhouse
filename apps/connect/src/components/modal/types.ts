import type { modalsMap } from "@powerhousedao/connect";

export type ModalsMap = typeof modalsMap;

export type ModalType = keyof ModalsMap;

export type ModalPropsMapping = {
  [K in ModalType]: React.ComponentProps<ModalsMap[K]>;
};

export type MapModalProps<T> = {
  [K in keyof T]: Omit<T[K], "open" | "onClose"> & { onClose?: () => void };
};

export type ModalProps = MapModalProps<ModalPropsMapping>;

export interface ModalContextValue {
  showModal: <T extends ModalType>(modalType: T, props: ModalProps[T]) => void;
  closeModal: () => void;
}
