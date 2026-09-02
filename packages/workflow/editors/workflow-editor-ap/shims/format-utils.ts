// Shim for @/lib/format-utils (only formatDuration is used by the canvas).
export const formatUtils = {
  formatDuration(durationMs: number | undefined, short?: boolean): string {
    if (durationMs === undefined) return "-";
    if (durationMs < 1000) {
      return short
        ? `${Math.floor(durationMs)}ms`
        : `${Math.floor(durationMs)} ms`;
    }
    const seconds = durationMs / 1000;
    if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.round(seconds % 60);
    return `${minutes}m ${rest}s`;
  },
};
