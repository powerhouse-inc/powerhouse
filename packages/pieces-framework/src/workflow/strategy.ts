// How a trigger is fed, decided from its resolved descriptor's strategy. The
// runtime arms by it and the editor draws by it; nothing stores it.

export type TriggerDelivery = "poll" | "webhook" | "manual";

export type TriggerStrategyCheck =
  | { delivery: TriggerDelivery }
  | { issue: string };

const DELIVERIES: Record<string, TriggerDelivery> = {
  POLLING: "poll",
  WEBHOOK: "webhook",
  MANUAL: "manual",
};

// Activepieces routes APP_WEBHOOK events through one app-level endpoint and a
// listener table; this runtime has neither, so it refuses them.
export const APP_WEBHOOK_UNSUPPORTED =
  "TriggerStrategy.APP_WEBHOOK (app-level webhooks) is not supported";

export class TriggerStrategyError extends Error {
  readonly strategy: unknown;

  constructor(strategy: unknown, issue: string) {
    super(issue);
    this.name = "TriggerStrategyError";
    this.strategy = strategy;
  }
}

export function checkTriggerStrategy(strategy: unknown): TriggerStrategyCheck {
  if (typeof strategy === "string" && Object.hasOwn(DELIVERIES, strategy)) {
    return { delivery: DELIVERIES[strategy] };
  }
  if (strategy === "APP_WEBHOOK") return { issue: APP_WEBHOOK_UNSUPPORTED };
  return {
    issue:
      strategy === undefined || strategy === null || strategy === ""
        ? "The trigger declares no strategy"
        : `Unknown trigger strategy ${JSON.stringify(strategy)}`,
  };
}

// Throws TriggerStrategyError for an unsupported or unknown strategy.
export function triggerDelivery(strategy: unknown): TriggerDelivery {
  const check = checkTriggerStrategy(strategy);
  if ("issue" in check) throw new TriggerStrategyError(strategy, check.issue);
  return check.delivery;
}
