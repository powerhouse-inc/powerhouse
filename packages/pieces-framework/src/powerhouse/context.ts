import type {
  ActionContext,
  InputPropertyMap,
  PieceAuthProperty,
  PropertyContext,
  TriggerHookContext,
  TriggerStrategy,
} from "../../upstream/framework/index.js";
import type { ReactorService } from "./reactor.js";

type AnyPieceAuth = PieceAuthProperty | PieceAuthProperty[] | undefined;

// A framework context as the Powerhouse host hands it to a piece: with the
// reactor the piece runs inside.
export type WithReactor<C> = C & { reactor: ReactorService };

export type PowerhouseActionContext<
  Auth extends AnyPieceAuth = undefined,
  Props extends InputPropertyMap = InputPropertyMap,
> = WithReactor<ActionContext<Auth, Props>>;

export type PowerhousePropertyContext = WithReactor<PropertyContext>;

export type PowerhouseTriggerHookContext<
  Auth extends AnyPieceAuth,
  Props extends InputPropertyMap,
  S extends TriggerStrategy,
> = WithReactor<TriggerHookContext<Auth, Props, S>>;

// The reactor behind any context, or a legible error where no host serves one.
export function reactorOf(ctx: unknown): ReactorService {
  const reactor =
    ctx !== null && typeof ctx === "object"
      ? (ctx as { reactor?: ReactorService }).reactor
      : undefined;
  if (!reactor) {
    throw new Error(
      "ctx.reactor is not available: this piece is not running on a Powerhouse reactor",
    );
  }
  return reactor;
}
