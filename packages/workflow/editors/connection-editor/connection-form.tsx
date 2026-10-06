// Presentation for the connection editor: connector picker driven by the
// piece catalog, auth form driven by the piece's PieceAuth descriptor.
import { useEffect, useId, useRef, useState } from "react";
import {
  isReactorConnectorId,
  REACTOR_CONNECTOR_ID,
  type ConnectionAuthType,
  type ConnectionState,
  type ConnectionStatus,
  type ReactorConnectionConfigValue,
} from "document-models/connection";
import type {
  PieceSummary,
  SecretStat,
} from "../workflow-editor/runtime-client.js";
import {
  useOAuthAttempt,
  useOAuthRedirectUri,
  usePieceCatalog,
  useRuntimeActions,
  useSecretStat,
} from "../workflow-editor/runtime-context.js";
import { formatWhen } from "../workflow-studio/components/run-format.js";
import { Icon } from "../shared/icons.js";
import { AUTH_TYPE_LABEL } from "./status.js";
import { ReactorConnectionSettings } from "./ReactorConnectionSettings.js";
import {
  Button,
  FieldError,
  FieldLabel as LabelRow,
  Hint as HintText,
  IconButton,
  Select,
  Switch,
  textInputClass,
} from "../shared/controls.js";
import {
  isAuthComplete,
  OAUTH_TOKEN,
  packageFromConnectorId,
  planForConnection,
  planFromAuth,
  plansFromAuth,
  UNKNOWN_AUTH,
  type AuthField,
  type AuthPlan,
} from "./piece-auth.js";

export interface ConnectionCallbacks {
  setName: (name: string) => void;
  pickPiece: (piece: PieceSummary) => void;
  // `keep` names the new method's fields; any other credential is dropped.
  setAuthType: (
    authType: ConnectionAuthType,
    keep: { config: string[]; secrets: string[] },
  ) => void;
  setConfigValue: (name: string, value: unknown) => void;
  setSecretRef: (name: string, ref: string) => void;
  removeSecretRef: (name: string) => void;
  setStatus: (status: ConnectionStatus) => void;
  // Makes this a REACTOR connection, reaching documents rather than a service.
  pickReactor: () => void;
  setReactorConfig: (config: ReactorConnectionConfigValue) => void;
}

const inputClass = textInputClass;

function FieldLabel(props: { field: AuthField }) {
  return (
    <LabelRow
      label={props.field.displayName}
      optional={!props.field.required}
    />
  );
}

function Hint(props: { children?: string }) {
  return <HintText text={props.children ?? ""} />;
}

function ConfigField(props: {
  field: AuthField;
  value: unknown;
  onCommit: (value: unknown) => void;
}) {
  const { field, value } = props;
  if (field.inputType === "CHECKBOX") {
    return (
      <Switch
        checked={Boolean(value)}
        onChange={(checked) => props.onCommit(checked)}
        label={field.displayName}
        description={field.description}
      />
    );
  }
  if (field.inputType === "STATIC_DROPDOWN") {
    return (
      <div>
        <FieldLabel field={field} />
        <Select
          value={typeof value === "string" ? value : ""}
          options={(field.options ?? []).map((option) => ({
            value: String(option.value),
            label: option.label,
          }))}
          clearable={!field.required}
          onChange={(next) => props.onCommit(next || undefined)}
        />
        <Hint>{field.description}</Hint>
      </div>
    );
  }
  return (
    <label className="block">
      <FieldLabel field={field} />
      <input
        className={inputClass}
        type={field.inputType === "NUMBER" ? "number" : "text"}
        defaultValue={
          typeof value === "string" || typeof value === "number" ? value : ""
        }
        spellCheck={false}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          if (raw === "") props.onCommit(undefined);
          else if (field.inputType === "NUMBER") props.onCommit(Number(raw));
          else props.onCommit(raw);
        }}
      />
      <Hint>{field.description}</Hint>
    </label>
  );
}

const SECRET_REF_PREFIX = "secret://v1:";

function isManagedRef(ref: string): boolean {
  return ref.startsWith(SECRET_REF_PREFIX);
}

function SavedSecret(props: {
  stat: SecretStat | undefined;
  fresh: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const { stat, fresh } = props;
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-solid border-foreground/10 bg-muted/40 px-3 py-2.5"
      title={stat?.label ?? undefined}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-wf-ok/12 text-wf-ok">
        <Icon name="lock" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          aria-hidden
          className="block font-mono text-sm leading-5 tracking-[0.08em] text-foreground"
        >
          ••••••••••••
        </span>
        <span className="block text-xs text-muted-foreground">
          {stat === undefined ? (
            "Checking the saved value…"
          ) : fresh ? (
            <span className="inline-flex items-center gap-1 font-medium text-wf-ok">
              <Icon name="check" className="h-3 w-3" />
              Saved just now
            </span>
          ) : (
            <span title={new Date(stat.updatedAt).toLocaleString()}>
              Saved {formatWhen(stat.updatedAt)}
              {stat.version > 1 ? `, version ${stat.version}` : ""}
            </span>
          )}
        </span>
      </span>
      <Button size="sm" onClick={props.onReplace}>
        Replace
      </Button>
      <IconButton
        icon="trash"
        label="Remove saved value"
        onClick={props.onRemove}
      />
    </div>
  );
}

// The input takes the VALUE; only the minted ref ever enters the document.
// A stored secret is replaced by rotating it in place unless asked otherwise.
function SecretField(props: {
  field: AuthField;
  refValue: string;
  connectionName: string;
  onCommit: (ref: string) => void;
  onRemove: () => void;
}) {
  const { field, refValue } = props;
  const inputId = useId();
  const managed = isManagedRef(refValue);
  const stat = useSecretStat(refValue, managed);
  const actions = useRuntimeActions();
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  // Mints a new ref instead of rotating the existing one.
  const [separate, setSeparate] = useState(false);

  const stored = managed && stat !== null && stat?.status !== "DELETED";
  const problem = !refValue
    ? null
    : stat?.status === "DELETED"
      ? "The saved value was deleted on the switchboard. Paste a new one."
      : stat === null
        ? "The saved reference no longer resolves. Paste the value again."
        : null;
  const showEditor = !stored || editing;

  const cancel = () => {
    setValue("");
    setError(null);
    setEditing(false);
    setReveal(false);
  };

  const save = () => {
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    const label = `${props.connectionName || "connection"} · ${field.displayName}`;
    const request =
      stored && !separate
        ? actions.rotateSecret(refValue, value)
        : actions.createSecret(value, label);
    request
      .then((result) => {
        cancel();
        setJustSaved(true);
        if (result.ref !== refValue) props.onCommit(result.ref);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : String(requestError),
        );
      })
      .finally(() => setBusy(false));
  };

  return (
    <div>
      <LabelRow
        htmlFor={showEditor ? inputId : undefined}
        label={field.displayName}
        optional={!field.required}
        needsValue={field.required && !stored}
        action={
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={advanced}
            onClick={() => setAdvanced((open) => !open)}
          >
            {advanced ? "Hide reference" : "Reference"}
          </button>
        }
      />
      {stored && !editing ? (
        <SavedSecret
          stat={stat}
          fresh={justSaved}
          onReplace={() => {
            setJustSaved(false);
            setEditing(true);
          }}
          onRemove={props.onRemove}
        />
      ) : null}
      {problem ? (
        <p className="mb-2 flex items-start gap-2 rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
          <Icon name="alert" className="mt-px h-3.5 w-3.5" />
          {problem}
        </p>
      ) : null}
      {showEditor ? (
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <input
              id={inputId}
              className={`${inputClass} pr-9 ${value && !reveal ? "font-mono tracking-wider" : ""}`}
              type={reveal ? "text" : "password"}
              value={value}
              disabled={busy}
              autoFocus={editing}
              placeholder={
                stored
                  ? `Paste the new ${field.displayName.toLowerCase()}`
                  : `Paste the ${field.displayName.toLowerCase()}`
              }
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape" && editing) cancel();
              }}
            />
            <span className="absolute inset-y-0 right-1 flex items-center">
              <IconButton
                icon={reveal ? "eyeOff" : "eye"}
                label={`${reveal ? "Hide" : "Show"} ${field.displayName}`}
                onClick={() => setReveal((shown) => !shown)}
              />
            </span>
          </div>
          <Button
            variant="primary"
            aria-label={`Save ${field.displayName}`}
            disabled={!value || busy}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
          {editing ? (
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          ) : null}
          {problem ? (
            <IconButton
              icon="trash"
              label="Remove saved value"
              onClick={props.onRemove}
            />
          ) : null}
        </div>
      ) : null}
      <FieldError>{error}</FieldError>
      <Hint>{field.description}</Hint>
      {advanced ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-dashed border-foreground/15 px-3 py-3">
          <div>
            <LabelRow htmlFor={`${inputId}-ref`} label="Secret reference" />
            <input
              id={`${inputId}-ref`}
              key={refValue}
              className={`${inputClass} font-mono text-xs`}
              defaultValue={refValue}
              placeholder="secret://v1:…"
              spellCheck={false}
              onBlur={(event) => {
                const ref = event.target.value.trim();
                if (!ref || ref === refValue) return;
                if (!isManagedRef(ref)) {
                  setError(
                    "Only secret://v1: references resolve. To store a value, paste it above instead.",
                  );
                  return;
                }
                setError(null);
                props.onCommit(ref);
              }}
            />
            <HintText text="Point at a secret that already exists on the switchboard, for example one shared with another connection." />
          </div>
          {stored ? (
            <Switch
              checked={separate}
              onChange={setSeparate}
              label="Save replacements as a separate secret"
              description="Leaves the current secret untouched for anything else that uses it, instead of adding a new version."
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Set on the page a full-page sign-in returns to.
const RETURN_PARAM = "ph_oauth";

function returnedState(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get(RETURN_PARAM);
}

function clearReturnedState(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(RETURN_PARAM)) return;
  url.searchParams.delete(RETURN_PARAM);
  window.history.replaceState(window.history.state, "", url.href);
}

function CopyField(props: { label: string; value: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <LabelRow label={props.label} />
      <div className="flex items-center gap-2">
        <input
          className={`${inputClass} font-mono text-xs`}
          readOnly
          value={props.value}
          onFocus={(event) => event.target.select()}
        />
        <IconButton
          icon={copied ? "check" : "copy"}
          label={`Copy ${props.label.toLowerCase()}`}
          onClick={() => {
            void navigator.clipboard.writeText(props.value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        />
      </div>
      <HintText text={props.hint} />
    </div>
  );
}

// Signs in through the provider in a popup; the switchboard exchanges the
// code and stores the token, and this polls until it has.
function OAuthConnect(props: {
  connectionId: string | undefined;
  state: ConnectionState;
  ready: boolean;
}) {
  const { connectionId, state } = props;
  const actions = useRuntimeActions();
  const redirect = useOAuthRedirectUri();
  const [attemptState, setAttemptState] = useState<string | null>(
    returnedState,
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const popup = useRef<Window | null>(null);
  const polled = useOAuthAttempt(attemptState);
  // A returned sign-in may be another connection's; that one's editor takes it.
  const ours = polled != null && polled.connectionId === connectionId;
  const attempt = ours ? polled : null;
  const dropped = polled === null || (polled !== undefined && !ours);
  const finished =
    dropped || attempt?.status === "OK" || attempt?.status === "ERROR";

  useEffect(() => {
    if (ours || polled === null) clearReturnedState();
  }, [ours, polled]);

  useEffect(() => {
    if (!finished) return;
    popup.current?.close();
    popup.current = null;
  }, [finished]);

  const signedIn = state.secretRefs.some((ref) => ref.name === OAUTH_TOKEN);
  const redirectUri = redirect.data ?? undefined;
  const waiting = attemptState !== null && !finished;

  const connect = () => {
    if (!connectionId || starting) return;
    setError(null);
    setStarting(true);
    // Opened on the click itself, or a popup blocker refuses it.
    const opened = window.open(
      "about:blank",
      "ph-oauth",
      "popup,width=520,height=700",
    );
    popup.current = opened;
    actions
      .startOAuth(connectionId, {
        redirectUri,
        // Blocked: the whole page goes, and comes back here afterwards.
        ...(opened ? {} : { returnUrl: window.location.href }),
      })
      .then((started) => {
        if (opened) {
          opened.location.href = started.authorizationUrl;
          setAttemptState(started.state);
        } else {
          window.location.assign(started.authorizationUrl);
        }
      })
      .catch((startError: unknown) => {
        opened?.close();
        popup.current = null;
        setError(
          startError instanceof Error ? startError.message : String(startError),
        );
      })
      .finally(() => setStarting(false));
  };

  const cancel = () => {
    popup.current?.close();
    popup.current = null;
    setAttemptState(null);
  };

  return (
    <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-5">
      <div>
        <h3 className="text-[13px] font-semibold text-foreground">Sign in</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Uses your own OAuth app. Register the redirect URL below with it, fill
          in its client ID and secret, then connect.
        </p>
      </div>
      {redirect.data ? (
        <CopyField
          label="Redirect URL"
          value={redirect.data}
          hint="Add this as an authorized redirect URI in the service's developer console."
        />
      ) : redirect.data === null ? (
        <p className="rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
          This switchboard serves no OAuth callback, so it cannot sign in.
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          variant={signedIn ? "secondary" : "primary"}
          disabled={
            !connectionId || !props.ready || starting || waiting || !redirectUri
          }
          onClick={connect}
        >
          {starting
            ? "Opening…"
            : waiting
              ? "Waiting for sign-in…"
              : signedIn
                ? "Reconnect"
                : "Connect"}
        </Button>
        {waiting ? (
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {attempt?.status === "OK"
            ? `Signed in${state.accountLabel ? ` as ${state.accountLabel}` : ""}`
            : signedIn && !waiting
              ? state.accountLabel
                ? `Signed in as ${state.accountLabel}`
                : "Signed in"
              : !connectionId
                ? "Open the connection to sign in."
                : !props.ready
                  ? "Fill in the client ID and secret first."
                  : ""}
        </span>
      </div>
      <FieldError>
        {error ?? (attempt?.status === "ERROR" ? attempt.error : null)}
      </FieldError>
    </div>
  );
}

// A method's own name, unless it's the generic "Connection" OAuth2 uses.
function methodLabel(plan: AuthPlan): string {
  return plan.displayName && plan.displayName !== "Connection"
    ? plan.displayName
    : AUTH_TYPE_LABEL[plan.authType];
}

export function ConnectionForm(props: {
  state: ConnectionState;
  callbacks: ConnectionCallbacks;
  // Needed to sign an OAuth2 connection in.
  connectionId?: string;
  // Lists Powerhouse documents beside the services; off for a piece's own.
  offerReactor?: boolean;
}) {
  const { state, callbacks } = props;
  const reactor = isReactorConnectorId(state.connectorId);
  const catalogQuery = usePieceCatalog();
  const catalog = catalogQuery.data ?? (catalogQuery.isError ? [] : null);

  const packageName = packageFromConnectorId(state.connectorId);
  const piece = catalog?.find((entry) => entry.name === packageName);
  // Descriptor plan when the piece is known; otherwise reconstruct enough
  // from state so existing refs stay editable.
  const plans = piece ? plansFromAuth(piece.auth) : [];
  const plan: AuthPlan = piece
    ? planForConnection(piece.auth, state.authType)
    : {
        authType: state.authType,
        configFields: [],
        secretFields: state.secretRefs.map((ref) => ({
          name: ref.name,
          displayName: ref.name,
          required: false,
        })),
        supported: state.authType !== "OIDC",
      };

  const config = (state.config ?? {}) as Record<string, unknown>;
  const refByName = new Map(state.secretRefs.map((ref) => [ref.name, ref.ref]));

  // Recomputed on every edit: promotes UNCONFIGURED to OK, and demotes back
  // when a required field is cleared. REVOKED/ERROR are left alone.
  const maybeMarkConfigured = (
    nextConfig: Record<string, unknown>,
    nextRefs: Map<string, string>,
  ) => {
    // An OAuth2 connection is ready once signed in, which the switchboard records.
    if (!plan.supported || plan.oauth2) return;
    const complete = isAuthComplete(plan, nextConfig, nextRefs);
    if (complete && state.status === "UNCONFIGURED") {
      callbacks.setStatus("OK");
    } else if (!complete && state.status === "OK") {
      callbacks.setStatus("UNCONFIGURED");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <LabelRow label="Service" />
        <Select
          value={reactor ? REACTOR_CONNECTOR_ID : packageName}
          loading={catalog === null}
          placeholder="Choose the service to connect"
          options={[
            ...(props.offerReactor !== false || reactor
              ? [
                  {
                    value: REACTOR_CONNECTOR_ID,
                    label: "Powerhouse documents",
                    description:
                      "Lets a step read or write documents on this Switchboard",
                  },
                ]
              : []),
            ...(catalog ?? []).map((entry) => ({
              value: entry.name,
              label: entry.displayName,
              // Its only sign-in method is one this runtime can't store.
              ...(planFromAuth(entry.auth).authType === UNKNOWN_AUTH
                ? { disabled: true, description: AUTH_TYPE_LABEL[UNKNOWN_AUTH] }
                : { description: entry.description }),
              icon: entry.logoUrl ? (
                <img
                  src={entry.logoUrl}
                  alt=""
                  loading="lazy"
                  className="h-4 w-4 shrink-0 object-contain"
                />
              ) : undefined,
            })),
          ]}
          onChange={(name) => {
            if (name === REACTOR_CONNECTOR_ID) {
              callbacks.pickReactor();
              return;
            }
            const picked = catalog?.find((entry) => entry.name === name);
            if (picked) callbacks.pickPiece(picked);
          }}
        />
        {piece ? <HintText text={piece.description} /> : null}
      </div>

      {reactor ? (
        <ReactorConnectionSettings state={state} callbacks={callbacks} />
      ) : null}

      {!reactor && plans.length > 1 ? (
        <div>
          <LabelRow label="Sign in with" />
          <Select
            value={plan.authType}
            options={plans.map((option) => ({
              value: option.authType,
              label: methodLabel(option),
              description:
                option.supported || option.authType === UNKNOWN_AUTH
                  ? AUTH_TYPE_LABEL[option.authType]
                  : "Not supported yet",
              disabled: !option.supported,
            }))}
            onChange={(value) => {
              const authType = value as ConnectionAuthType;
              const next = plans.find((option) => option.authType === authType);
              if (!next) return;
              callbacks.setAuthType(authType, {
                config: next.configFields.map((field) => field.name),
                secrets: next.secretFields.map((field) => field.name),
              });
              // Switching resets the status; a method already filled in is ready.
              if (isAuthComplete(next, config, refByName)) {
                callbacks.setStatus("OK");
              }
            }}
          />
          {plan.description ? <HintText text={plan.description} /> : null}
        </div>
      ) : null}

      {plan.supported || reactor ? null : (
        <p className="rounded-md bg-wf-warn/10 px-3 py-2 text-xs text-wf-warn">
          {plan.authType === UNKNOWN_AUTH
            ? `${plan.declaredType ?? "This sign-in method"}: not supported by this runtime.`
            : `${plan.authType} connections are not executable by the workflow runtime yet.`}
        </p>
      )}

      {plan.configFields.length > 0 ? (
        <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-5">
          <h3 className="text-[13px] font-semibold text-foreground">
            Configuration
          </h3>
          {plan.configFields.map((field) => (
            <ConfigField
              key={field.name}
              field={field}
              value={config[field.name]}
              onCommit={(value) => {
                callbacks.setConfigValue(field.name, value);
                maybeMarkConfigured(
                  { ...config, [field.name]: value },
                  refByName,
                );
              }}
            />
          ))}
        </div>
      ) : null}

      {plan.secretFields.length > 0 ? (
        <div className="flex flex-col gap-5 border-t border-solid border-foreground/10 pt-5">
          <div>
            <h3 className="text-[13px] font-semibold text-foreground">
              Credentials
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Saved encrypted on the switchboard. This connection only keeps a
              reference, so nobody reading it can see the values.
            </p>
          </div>
          {plan.secretFields.map((field) => (
            <SecretField
              key={field.name}
              field={field}
              connectionName={state.name}
              refValue={refByName.get(field.name) ?? ""}
              onCommit={(ref) => {
                callbacks.setSecretRef(field.name, ref);
                const nextRefs = new Map(refByName);
                nextRefs.set(field.name, ref);
                maybeMarkConfigured(config, nextRefs);
              }}
              onRemove={() => {
                callbacks.removeSecretRef(field.name);
                const nextRefs = new Map(refByName);
                nextRefs.delete(field.name);
                maybeMarkConfigured(config, nextRefs);
              }}
            />
          ))}
        </div>
      ) : null}

      {plan.oauth2 && plan.supported ? (
        <OAuthConnect
          connectionId={props.connectionId}
          state={state}
          ready={isAuthComplete(plan, config, refByName)}
        />
      ) : null}

      {state.lastError ? (
        <p className="rounded-md bg-wf-fail/10 px-3 py-2 text-xs text-wf-fail">
          {state.lastError}
        </p>
      ) : null}
    </div>
  );
}
