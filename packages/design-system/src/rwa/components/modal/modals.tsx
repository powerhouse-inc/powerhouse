import {
  RWACreateItemModal,
  RWADeleteItemModal,
} from "@powerhousedao/design-system";

export const modals = {
  createItem: RWACreateItemModal,
  deleteItem: RWADeleteItemModal,
};
export type Modals = typeof modals;

export type ModalType = keyof Modals;

export type ModalPropsMapping = {
  [K in ModalType]: React.ComponentProps<Modals[K]>;
};
