/** Renders a UTC-ms timestamp as "Ns/Nm/Nh/Nd ago", or "never" for 0. */
export function timeSince(utcMs: number, nowMs: number = Date.now()): string {
  if (utcMs === 0) {
    return "never";
  }
  const deltaMs = Math.max(0, nowMs - utcMs);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
