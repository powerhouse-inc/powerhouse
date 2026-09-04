// Shared by the connection toolbar and the form, so a connection's status
// looks the same wherever it appears.
import type { ConnectionStatus } from "document-models/connection";

export const CONNECTION_STATUS_STYLES: Record<ConnectionStatus, string> = {
  OK: "bg-green-100 text-green-700",
  ERROR: "bg-red-100 text-red-700",
  REVOKED: "bg-slate-200 text-slate-500",
  UNCONFIGURED: "bg-amber-100 text-amber-700",
};
