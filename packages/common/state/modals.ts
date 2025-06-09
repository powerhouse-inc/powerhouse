import {
  type DocumentModelModule,
  type PHDocument,
  type ValidationError,
} from "document-model";
import {
  atom,
  useAtomValue,
  useSetAtom,
  type Getter,
  type Setter,
  type WritableAtom,
} from "jotai";
import { useCallback, useMemo } from "react";

type ModalRegistry = {
  deleteNode: { nodeId: string };
  deleteDrive: { driveId: string };
  addDocument: { documentModelModule: DocumentModelModule };
  addDrive: Record<string, never>;
  settings: Record<string, never>;
  driveSettings: { driveId: string };
  upgradeDrive: { driveId: string };
  exportWithErrors: { document: PHDocument; validations: ValidationError[] };
  clearStorage: Record<string, never>;
  debugSettings: Record<string, never>;
  disclaimer: Record<string, never>;
  cookiesPolicy: Record<string, never>;
};

type ModalId = keyof ModalRegistry;

type ModalState =
  | { id: null; props: null }
  | {
      [K in ModalId]: { id: K; props: ModalRegistry[K] };
    }[ModalId];

const modalAtom = atom<ModalState>({ id: null, props: null });

type ShowPayload = Exclude<ModalState, { id: null }>;

const showModalAtom: WritableAtom<null, [ShowPayload], void> = atom(
  null,
  (_get: Getter, set: Setter, payload: ShowPayload) => {
    set(modalAtom, payload);
  },
);

const hideModalAtom = atom(null, (_get, set) => {
  set(modalAtom, { id: null, props: null });
});

type ShowPayloadFor<K extends keyof ModalRegistry> = Extract<
  Exclude<
    | { id: null; props: null }
    | {
        [I in keyof ModalRegistry]: { id: I; props: ModalRegistry[I] };
      }[keyof ModalRegistry],
    { id: null }
  >,
  { id: K }
>;

export function useModal<K extends keyof ModalRegistry>(modalId: K) {
  const modal = useAtomValue(modalAtom);
  const showModal = useSetAtom(showModalAtom);
  const hide = useSetAtom(hideModalAtom);

  const isOpen = useMemo(() => modal.id === modalId, [modal.id, modalId]);

  const props = useMemo(
    () => (isOpen ? (modal.props as ModalRegistry[K]) : null),
    [isOpen, modal.props],
  );

  const show = useCallback(
    (props: ModalRegistry[K]) => {
      const payload: ShowPayloadFor<K> = {
        id: modalId,
        props,
      } as ShowPayloadFor<K>;
      showModal(payload);
    },
    [modalId, showModal],
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
