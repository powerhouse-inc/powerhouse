import type { ConnectToastOptions } from "@powerhousedao/design-system/connect/components/toast/toast";
import {
  ToastContainer as BaseToastContainer,
  toast as baseToast,
} from "@powerhousedao/design-system/connect/components/toast/toast";
import { createElement } from "react";

export const CONNECT_TOAST_CONTAINER_ID = "connect";

export const ToastContainer = () =>
  createElement(BaseToastContainer, {
    containerId: CONNECT_TOAST_CONTAINER_ID,
  });

type ToastArgs = Parameters<typeof baseToast>;
export function toast(content: ToastArgs[0], options?: ConnectToastOptions) {
  const {
    type = "default",
    containerId = CONNECT_TOAST_CONTAINER_ID,
    ...restOptions
  } = options || {};
  return baseToast(content, { type, containerId, ...restOptions });
}
