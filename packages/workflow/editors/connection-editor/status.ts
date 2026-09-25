// Shared by the connection toolbar and the form, so a connection's status
// looks the same wherever it appears.
import type {
  ConnectionAuthType,
  ConnectionStatus,
} from "document-models/connection";

export const CONNECTION_STATUS_STYLES: Record<ConnectionStatus, string> = {
  OK: "bg-wf-ok/12 text-wf-ok",
  ERROR: "bg-wf-fail/12 text-wf-fail",
  REVOKED: "bg-wf-fail/12 text-wf-fail",
  UNCONFIGURED: "bg-wf-warn/12 text-wf-warn",
};

export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  OK: "Connected",
  ERROR: "Error",
  REVOKED: "Revoked",
  UNCONFIGURED: "Not set up",
};

export const AUTH_TYPE_LABEL: Record<ConnectionAuthType, string> = {
  NONE: "None",
  SECRET_TEXT: "API key",
  BASIC_AUTH: "Username and password",
  CUSTOM_AUTH: "Keys and tokens",
  OAUTH2: "OAuth 2",
  OIDC: "OpenID Connect",
};
