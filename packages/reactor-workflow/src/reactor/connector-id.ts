// A connection's connectorId is "<piece package>#<piece short name>"; the
// runtime only ever needs the package half back out of it, never a version.
export function packageFromConnectorId(connectorId: string): string {
  const separator = connectorId.lastIndexOf("#");
  if (separator <= 0) return connectorId;
  const spec = connectorId.slice(0, separator);
  const at = spec.indexOf("@", 1);
  return at > 0 ? spec.slice(0, at) : spec;
}
