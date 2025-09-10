import React, {
  Suspense,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ModalPropsMapping, ModalType } from "./modals/index.js";
import { modals } from "./modals/index.js";

type MapModalProps<T> = {
  [K in keyof T]: Omit<T[K], "open" | "onClose"> & { onClose?: () => void };
};

type ModalProps = MapModalProps<ModalPropsMapping>;

interface ModalContextValue {
  showModal: <T extends ModalType>(modalType: T, props: ModalProps[T]) => void;
  closeModal: () => void;
}

export const ModalContext = React.createContext<ModalContextValue>({
  showModal: () => {},
  closeModal: () => {},
});

export const useModal = () => {
  const context = useContext(ModalContext);
  return context;
};

export const ModalManager: React.FC<{ children?: React.ReactNode }> = (
  props,
) => {
  const { children } = props;

  const [modalProps, setModalProps] = useState<ModalProps[keyof ModalProps]>();
  const [modalType, setModalType] = useState<ModalType>();
  const [open, setOpen] = useState(false);

  const showModal: ModalContextValue["showModal"] = useCallback(
    (modalType, props) => {
      setOpen(true);
      setModalProps(props);
      setModalType(modalType);
    },
    [],
  );

  const closeModal: ModalContextValue["closeModal"] = useCallback(() => {
    setOpen(false);
  }, []);

  const ModalComponent = modalType ? modals[modalType] : null;

  const value = useMemo(
    () => ({ showModal, closeModal }),
    [closeModal, showModal],
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      <Suspense name="ModalManager">
        {ModalComponent && (
          <ModalComponent
            {...(modalProps as any)}
            open={open}
            onClose={closeModal}
          />
        )}
      </Suspense>
    </ModalContext.Provider>
  );
};
