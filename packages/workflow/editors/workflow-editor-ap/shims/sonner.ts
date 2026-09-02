// Shim for the sonner toast library: logs instead of rendering toasts.
type ToastOptions = Record<string, unknown>;

interface ToastFn {
  (message: unknown, options?: ToastOptions): void;
  success: (message: unknown, options?: ToastOptions) => void;
  error: (message: unknown, options?: ToastOptions) => void;
  info: (message: unknown, options?: ToastOptions) => void;
  warning: (message: unknown, options?: ToastOptions) => void;
  dismiss: (id?: unknown) => void;
  loading: (message: unknown, options?: ToastOptions) => void;
}

const base = (message: unknown): void => {
  console.info("[toast]", message);
};

export const toast: ToastFn = Object.assign(base, {
  success: base,
  error: (message: unknown) => console.error("[toast]", message),
  info: base,
  warning: (message: unknown) => console.warn("[toast]", message),
  dismiss: () => {},
  loading: base,
});

export function Toaster(): null {
  return null;
}
