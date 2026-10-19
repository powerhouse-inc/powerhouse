// Grants the Switchboard on the documents steps write, so their writes pass
// admission under enforcement (ADR 0005 §8).
import { useDrives } from "@powerhousedao/reactor-browser";
import { useState } from "react";
import { Button, FieldLabel, Hint, Select } from "../../shared/controls.js";
import {
  grantOnDocuments,
  useDocumentAuths,
  useSignInGate,
  type GrantOutcome,
} from "../reactor-hooks.js";
import { documentOptions, type DriveLike } from "./document-options.js";
import {
  planGrants,
  switchboardGrants,
  switchboardMayWrite,
} from "./reactor-access.js";
import { SignInPrompt } from "./SignInPrompt.js";

function NamedList(props: {
  label: string;
  heading: string;
  next: string;
  ids: readonly string[];
  names: ReadonlyMap<string, string>;
}) {
  if (props.ids.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{props.heading}</p>
      <ul aria-label={props.label} className="mt-1">
        {props.ids.map((id) => (
          <li key={id} className="truncate text-xs text-foreground">
            {props.names.get(id) ?? id}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-muted-foreground">{props.next}</p>
    </div>
  );
}

export function SwitchboardGrants() {
  const gate = useSignInGate();
  const drives = (useDrives() ?? []) as unknown as DriveLike[];
  const options = documentOptions(drives);
  const [chosen, setChosen] = useState<string[]>([]);
  const auths = useDocumentAuths(chosen);
  const [busy, setBusy] = useState(false);
  const [outcomes, setOutcomes] = useState<GrantOutcome[]>([]);
  const access = gate.access;
  if (!access?.authEnforcement) return null;
  const identity = access.reactorIdentity;
  const grants = switchboardGrants(identity, access.authConditions);
  const names = new Map(options.map((option) => [option.value, option.label]));

  const header = (
    <div>
      <h4 className="text-[13px] font-medium text-foreground">
        Switchboard grants
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        With document permissions enforced, a write lands only when the
        Switchboard may make it too. Grant it on each document steps write.
      </p>
    </div>
  );
  if (!gate.signedIn) {
    return (
      <section aria-label="Switchboard grants" className="flex flex-col gap-3">
        {header}
        <SignInPrompt
          gate={{ ...gate, required: true }}
          reason="Sign in to grant the Switchboard on documents."
        />
      </section>
    );
  }
  if (!identity || grants.length === 0) {
    return (
      <section aria-label="Switchboard grants" className="flex flex-col gap-3">
        {header}
        <p className="text-xs text-wf-warn">
          The Switchboard does not say who it signs as, so it can&apos;t be
          granted from here.
        </p>
      </section>
    );
  }

  const done = new Set(
    outcomes.filter((outcome) => !outcome.error).map((outcome) => outcome.id),
  );
  const failed = new Map(
    outcomes.flatMap((outcome) =>
      outcome.error ? [[outcome.id, outcome.error] as const] : [],
    ),
  );
  const granted = chosen.filter((id) => {
    if (done.has(id)) return true;
    const auth = auths?.get(id);
    return (
      auths?.has(id) && auth !== null && switchboardMayWrite(auth, identity)
    );
  });
  const pending = chosen.filter((id) => !granted.includes(id));
  const plan = auths
    ? planGrants(pending, (id) => auths.get(id), gate.subject)
    : null;
  const grantOn = (ids: string[]) => {
    setBusy(true);
    // Never rejects: each failure is an outcome.
    void grantOnDocuments(ids, grants)
      .then((next) =>
        setOutcomes((previous) => [
          ...previous.filter((outcome) => !ids.includes(outcome.id)),
          ...next,
        ]),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section aria-label="Switchboard grants" className="flex flex-col gap-3">
      {header}
      <div>
        <FieldLabel label="Documents" optional />
        <Select
          ariaLabel="Documents to grant on"
          multiple
          searchable
          value={chosen}
          options={options}
          placeholder="Choose documents"
          emptyText="No documents in this Connect's drives."
          onChange={setChosen}
        />
        <Hint text="Grants are per document; a drive's grants do not cover its documents." />
      </div>
      {chosen.length > 0 && !plan ? (
        <div className="h-10 animate-pulse rounded-md bg-foreground/5" />
      ) : null}
      {granted.length > 0 ? (
        <ul
          aria-label="Documents the Switchboard may write"
          className="flex flex-col gap-1"
        >
          {granted.map((id) => (
            <li key={id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {names.get(id) ?? id}
              </span>
              <span className="text-wf-ok">Granted</span>
            </li>
          ))}
        </ul>
      ) : null}
      {plan && plan.grantable.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {plan.grantable.map((id) => (
            <li key={id} className="flex items-center gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {names.get(id) ?? id}
              </span>
              {failed.has(id) ? (
                <span className="truncate text-wf-fail" title={failed.get(id)}>
                  {failed.get(id)}
                </span>
              ) : null}
              <Button
                size="sm"
                disabled={busy}
                aria-label={`Grant the Switchboard on ${names.get(id) ?? id}`}
                onClick={() => grantOn([id])}
              >
                Grant
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {plan && plan.grantable.length > 1 ? (
        <Button
          size="sm"
          variant="primary"
          disabled={busy}
          className="self-start"
          onClick={() => grantOn(plan.grantable)}
        >
          {busy ? "Granting…" : `Grant all ${plan.grantable.length}`}
        </Button>
      ) : null}
      {plan ? (
        <>
          <NamedList
            label="Documents you may not grant on"
            heading="You don't have permission to change grants on these:"
            next="Ask each document's admin to grant the Switchboard."
            ids={plan.noPermission}
            names={names}
          />
          <NamedList
            label="Documents not in this drive"
            heading="Not in this Connect, so they can't be granted from here:"
            next="Open the drive that holds them and grant there, or ask its admin."
            ids={plan.notHere}
            names={names}
          />
        </>
      ) : null}
    </section>
  );
}
