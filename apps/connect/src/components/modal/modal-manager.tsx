import type {
  ModalContextValue,
  ModalProps,
  ModalType,
} from "@powerhousedao/connect";
import { ModalContext, modalsMap } from "@powerhousedao/connect";
import { Suspense, useCallback, useMemo, useState } from "react";

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

  const ModalComponent = modalType ? modalsMap[modalType] : null;

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
