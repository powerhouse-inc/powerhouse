import {
  ToastContainer as BaseToastContainer,
  toast as baseToast,
  type ConnectToastOptions,
} from "@powerhousedao/design-system";

export const CONNECT_TOAST_CONTAINER_ID = "connect";

export const ToastContainer = () => (
  <BaseToastContainer containerId={CONNECT_TOAST_CONTAINER_ID} />
);

type ToastArgs = Parameters<typeof baseToast>;
export function toast(content: ToastArgs[0], options?: ConnectToastOptions) {
  const {
    type = "default",
    containerId = CONNECT_TOAST_CONTAINER_ID,
    ...restOptions
  } = options || {};
  return baseToast(content, { type, containerId, ...restOptions });
}
