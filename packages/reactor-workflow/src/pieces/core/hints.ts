// What the core piece declares beyond Activepieces' metadata. The descriptor
// builder copies these; the in-process executor routes by `portOf`.

export interface PropHints {
  // Shown while a sibling holds one of `oneOf`.
  showWhen?: { prop: string; oneOf: unknown[] };
  // A checkbox with this label that stores "" on purpose.
  emptyChoice?: string;
}

export function withHints<P extends object>(property: P, hints: PropHints): P {
  return { ...property, ...hints };
}

export const shownWhen = (prop: string, oneOf: unknown[]): PropHints => ({
  showWhen: { prop, oneOf },
});

export interface PortedAction {
  ports: readonly string[];
  // The port a successful result leaves on.
  portOf: (output: unknown) => string;
}

export function withPorts<A extends object>(
  action: A,
  ported: PortedAction,
): A & PortedAction {
  return Object.assign(action, ported);
}

export function isPorted(action: unknown): action is PortedAction {
  const candidate = action as Partial<PortedAction> | null;
  return (
    typeof candidate?.portOf === "function" && Array.isArray(candidate.ports)
  );
}

// A form the editor draws instead of the trigger's props, e.g. "schedule".
export function withDisplay<T extends object>(
  trigger: T,
  display: string,
): T & { display: string } {
  return Object.assign(trigger, { display });
}
