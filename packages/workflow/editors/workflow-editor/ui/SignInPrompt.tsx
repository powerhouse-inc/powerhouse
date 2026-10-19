// Shown where reactor access needs a signed-in user: binding a reactor
// connection, granting the Switchboard, and publishing, under enforcement.
import { Button } from "../../shared/controls.js";
import { Icon } from "../../shared/icons.js";
import type { SignInGate } from "../reactor-hooks.js";

export function SignInPrompt(props: { gate: SignInGate; reason: string }) {
  const { gate } = props;
  if (!gate.required) return null;
  return (
    <div
      role="note"
      aria-label="Sign in required"
      className="flex items-start gap-2.5 rounded-md border border-solid border-wf-warn/30 bg-wf-warn/10 px-3 py-2.5"
    >
      <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wf-warn" />
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
        This Switchboard enforces document permissions. {props.reason}
      </p>
      <Button
        size="sm"
        variant="primary"
        disabled={gate.pending}
        onClick={gate.login}
      >
        {gate.pending ? "Signing in…" : "Sign in"}
      </Button>
    </div>
  );
}
