// `ctx.reactor` for a run-time hook, typed by the block's declaration.
import type {
  ReactorContext,
  RequireReactor,
} from "@powerhousedao/pieces-framework";

export type DeclaredReactor = {
  [R in RequireReactor]: { requireReactor: R } & ReactorContext<R>;
}[RequireReactor];

// Undeclared: no `reactor`, and the member throws by name.
export type ReactorOption =
  | DeclaredReactor
  | { requireReactor?: undefined; reactor?: never };
