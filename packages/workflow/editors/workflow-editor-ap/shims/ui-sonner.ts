// Shim for @/components/ui/sonner.
export { toast, Toaster } from "./sonner.js";

export function internalErrorToast(): void {
  console.error("[toast] An internal error occurred");
}
