// Shim for @/components/providers/telemetry-provider: telemetry disabled.
export function useTelemetry(): {
  capture: (event: unknown) => void;
  reset: () => void;
} {
  return { capture: () => {}, reset: () => {} };
}
