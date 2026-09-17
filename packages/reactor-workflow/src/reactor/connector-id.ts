// A connection's connectorId is "<piece package>#<piece short name>"; the
// runtime only ever needs the package half back out of it.
export function packageFromConnectorId(connectorId: string): string {
  const separator = connectorId.lastIndexOf("#");
  return separator > 0 ? connectorId.slice(0, separator) : connectorId;
}
