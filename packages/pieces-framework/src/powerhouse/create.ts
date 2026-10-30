// createAction and createTrigger as a Powerhouse piece calls them: upstream's,
// plus `requireReactor`, which types `ctx.reactor` in every hook.
import {
  createAction as upstreamCreateAction,
  createTrigger as upstreamCreateTrigger,
  type InputPropertyMap,
  type PieceAuthProperty,
  type TriggerStrategy,
} from "../../upstream/framework/index.js";
import type { ReactorContext, ReactorDeclaration } from "./reactor-client.js";

type AnyPieceAuth = PieceAuthProperty | PieceAuthProperty[] | undefined;

// A hook whose context also carries what the declaration grants.
type WithReactorHook<F, R extends ReactorDeclaration | undefined> = F extends (
  ctx: infer C,
) => infer Out
  ? (ctx: C & ReactorContext<R>) => Out
  : F;

type WithReactorHooks<
  Params,
  Hooks extends PropertyKey,
  R extends ReactorDeclaration | undefined,
> = {
  [K in keyof Params]: K extends Hooks
    ? WithReactorHook<Params[K], R>
    : Params[K];
} & { requireReactor?: R };

type UpstreamActionParams<
  PieceAuth extends AnyPieceAuth,
  ActionProps extends InputPropertyMap,
> = Parameters<typeof upstreamCreateAction<PieceAuth, ActionProps>>[0];

// The step's retry block. Omitted delays back off exponentially from 5s,
// capped at 300s; `retryOn` omitted retries every error.
export interface ActionRetryDefault {
  // Attempts, not retries: 1 is no retry. Clamped by the runtime.
  maxAttempts: number;
  backoff?: "FIXED" | "EXPONENTIAL";
  initialDelaySeconds?: number;
  maxDelaySeconds?: number;
  retryOn?: string[];
}

// Used for a step that sets no timeout or retry of its own.
export interface ActionDefaults {
  defaultTimeoutSeconds?: number;
  defaultRetry?: ActionRetryDefault;
}

export type CreateActionParams<
  PieceAuth extends AnyPieceAuth,
  ActionProps extends InputPropertyMap,
  R extends ReactorDeclaration | undefined,
> = WithReactorHooks<
  UpstreamActionParams<PieceAuth, ActionProps>,
  "run" | "test",
  R
> &
  ActionDefaults;

// A block with the declaration the host reads off it.
export type Declared<T, R extends ReactorDeclaration | undefined> = T & {
  readonly requireReactor?: Exclude<R, false>;
};

export function createAction<
  PieceAuth extends AnyPieceAuth = PieceAuthProperty,
  // oxlint-disable-next-line typescript/no-explicit-any -- upstream's default
  ActionProps extends InputPropertyMap = any,
  R extends ReactorDeclaration | undefined = undefined,
>(
  params: CreateActionParams<PieceAuth, ActionProps, R>,
): Declared<
  ReturnType<typeof upstreamCreateAction<PieceAuth, ActionProps>>,
  R
> &
  Readonly<ActionDefaults> {
  const { requireReactor, defaultTimeoutSeconds, defaultRetry, ...rest } =
    params;
  // The host serves `ctx.reactor`; upstream's context type does not know it.
  const action = upstreamCreateAction<PieceAuth, ActionProps>(
    rest as unknown as UpstreamActionParams<PieceAuth, ActionProps>,
  );
  return withDefaults(withDeclaration(action, requireReactor), {
    defaultTimeoutSeconds,
    defaultRetry,
  });
}

// Set only when declared, so an undeclared action describes as before.
function withDefaults<T extends object>(
  action: T,
  { defaultTimeoutSeconds, defaultRetry }: ActionDefaults,
): T & Readonly<ActionDefaults> {
  if (defaultTimeoutSeconds !== undefined) {
    if (!Number.isFinite(defaultTimeoutSeconds) || defaultTimeoutSeconds <= 0) {
      throw new Error(
        `defaultTimeoutSeconds must be a positive number, got ${JSON.stringify(defaultTimeoutSeconds)}`,
      );
    }
    Object.assign(action, { defaultTimeoutSeconds });
  }
  if (defaultRetry !== undefined) {
    const attempts = defaultRetry.maxAttempts;
    if (!Number.isInteger(attempts) || attempts < 1) {
      throw new Error(
        `defaultRetry.maxAttempts must be a positive integer, got ${JSON.stringify(attempts)}`,
      );
    }
    Object.assign(action, { defaultRetry });
  }
  return action;
}

type UpstreamTriggerParams<
  TS extends TriggerStrategy,
  PieceAuth extends AnyPieceAuth,
  TriggerProps extends InputPropertyMap,
> = Parameters<typeof upstreamCreateTrigger<TS, PieceAuth, TriggerProps>>[0];

type TriggerHooks =
  | "onEnable"
  | "onDisable"
  | "run"
  | "test"
  | "onStart"
  | "onHandshake"
  | "onRenew";

// One branch per strategy: each resolves upstream's conditional params, and
// `type` stays TS so the strategy is still inferred from it.
type StrategyParams<
  S extends TriggerStrategy,
  TS extends TriggerStrategy,
  PieceAuth extends AnyPieceAuth,
  TriggerProps extends InputPropertyMap,
  R extends ReactorDeclaration | undefined,
> = Omit<
  WithReactorHooks<
    UpstreamTriggerParams<S, PieceAuth, TriggerProps>,
    TriggerHooks,
    R
  >,
  "type"
> & { type: TS };

export type CreateTriggerParams<
  TS extends TriggerStrategy,
  PieceAuth extends AnyPieceAuth,
  TriggerProps extends InputPropertyMap,
  R extends ReactorDeclaration | undefined,
> = TS extends TriggerStrategy.WEBHOOK
  ? StrategyParams<TriggerStrategy.WEBHOOK, TS, PieceAuth, TriggerProps, R>
  : TS extends TriggerStrategy.POLLING
    ? StrategyParams<TriggerStrategy.POLLING, TS, PieceAuth, TriggerProps, R>
    : TS extends TriggerStrategy.APP_WEBHOOK
      ? StrategyParams<
          TriggerStrategy.APP_WEBHOOK,
          TS,
          PieceAuth,
          TriggerProps,
          R
        >
      : StrategyParams<TriggerStrategy.MANUAL, TS, PieceAuth, TriggerProps, R>;

export function createTrigger<
  TS extends TriggerStrategy,
  PieceAuth extends AnyPieceAuth,
  TriggerProps extends InputPropertyMap,
  R extends ReactorDeclaration | undefined = undefined,
>(
  params: CreateTriggerParams<TS, PieceAuth, TriggerProps, R>,
): Declared<
  ReturnType<typeof upstreamCreateTrigger<TS, PieceAuth, TriggerProps>>,
  R
> {
  const { requireReactor, ...rest } = params as CreateTriggerParams<
    TS,
    PieceAuth,
    TriggerProps,
    R
  > & { requireReactor?: R };
  const trigger = upstreamCreateTrigger<TS, PieceAuth, TriggerProps>(
    rest as unknown as UpstreamTriggerParams<TS, PieceAuth, TriggerProps>,
  );
  return withDeclaration(trigger, requireReactor);
}

// Set only when access is declared; `false` describes as no declaration.
function withDeclaration<
  T extends object,
  R extends ReactorDeclaration | undefined,
>(block: T, requireReactor: R | undefined): Declared<T, R> {
  if (requireReactor === undefined || requireReactor === false) return block;
  if (requireReactor !== "read" && requireReactor !== "write") {
    throw new Error(
      `requireReactor must be "read", "write" or false, got ${JSON.stringify(requireReactor)}`,
    );
  }
  return Object.assign(block, { requireReactor }) as Declared<T, R>;
}
