import {
  type DocumentModelModule,
  type PHDocument,
  type ValidationError,
} from "document-model";
import { atom, useAtomValue, useSetAtom, type WritableAtom } from "jotai";
import { useCallback, useMemo } from "react";

type ModalRegistry = {
  deleteNode: { nodeId: string };
  deleteDrive: { driveId: string };
  addDocument: { documentModelId: string };
  addDrive: never;
  settings: never;
  driveSettings: { driveId: string };
  upgradeDrive: { driveId: string };
  exportWithErrors: {
    document: PHDocument;
    validationErrors: ValidationError[];
  };
  clearStorage: never;
  debugSettings: never;
  disclaimer: never;
  cookiesPolicy: never;
};

type ModalId = keyof ModalRegistry;

type ModalState =
  | { id: null; props: null }
  | {
      [K in ModalId]: { id: K; props: ModalRegistry[K] };
    }[ModalId];
type PayloadMap = {
  [K in keyof ModalRegistry]: { id: K; props: ModalRegistry[K] };
};
type ShowPayload = PayloadMap[keyof PayloadMap];
type ShowPayloadFor<K extends keyof ModalRegistry> = PayloadMap[K];

type ShowFn<K extends ModalId> =
  // if props is `never`, zero arguments; otherwise one argument of the correct type
  ModalRegistry[K] extends never
    ? () => void
    : (props: ModalRegistry[K]) => void;

const modalAtom = atom<ModalState>({ id: null, props: null });
modalAtom.debugLabel = "modalAtom";

const showModalAtom: WritableAtom<null, [ShowPayload], void> = atom(
  null,
  (_get, set, payload) => {
    set(modalAtom, payload);
  },
);
showModalAtom.debugLabel = "showModalAtom";

const hideModalAtom = atom(null, (_get, set) => {
  set(modalAtom, { id: null, props: null });
});
hideModalAtom.debugLabel = "hideModalAtom";

export function useModal<K extends ModalId>(modalId: K) {
  const modal = useAtomValue(modalAtom);
  const showModal = useSetAtom(showModalAtom);
  const hide = useSetAtom(hideModalAtom);
  const isOpen = modal.id === modalId;

  const show = useCallback(
    (
      ...args: ModalRegistry[K] extends never
        ? [] // no args if `never`
        : [props: ModalRegistry[K]] // one arg otherwise
    ) => {
      // pull props out (if any), cast for the atom
      const props = args[0]!;
      showModal({ id: modalId, props } as ShowPayloadFor<K>);
    },
    [modalId, showModal],
  ) as ShowFn<K>;

  const props = useMemo(
    () => (modal.props ?? {}) as ModalRegistry[K],
    [modal.props],
  );

  return useMemo(
    () => ({
      isOpen,
      props,
      show,
      hide,
    }),
    [isOpen, props, show, hide],
  );
}
