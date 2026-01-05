import type { ReactNode } from "react";

export type PHToastType =
  | "default"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "connect-success"
  | "connect-warning"
  | "connect-loading"
  | "connect-deleted";

export type PHToastOptions = {
  type?: PHToastType;
  autoClose?: number | false;
  containerId?: string;
};

export type PHToastFn = (
  content: ReactNode | string,
  options?: PHToastOptions,
) => void;
