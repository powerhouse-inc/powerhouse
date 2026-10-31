// Flow control after Activepieces' ROUTER and LOOP_ON_ITEMS. The coordinator
// walks a loop's body itself; the loop action only checks its items.
import { createAction, Property } from "@powerhousedao/pieces-framework";
import {
  LOOP_ACTION,
  LOOP_PORTS,
  NEXT_PORT,
  OTHERWISE_PORT,
  ROUTER_ACTION,
  routerBranches,
  routerBranchName,
  routerBranchPort,
  routerPorts,
} from "@powerhousedao/pieces-framework/workflow";
import {
  BRANCH_OPERATORS,
  BranchConfigError,
  DEFAULT_BRANCH_OPERATOR,
  evaluateBranch,
} from "./branch-operators.js";
import { shownWhen, withHints, withPorts } from "./hints.js";

const operators = Object.entries(BRANCH_OPERATORS);
const BINARY_OPERATORS = operators
  .filter(([, spec]) => spec.binary)
  .map(([name]) => name);
const TEXT_OPERATORS = operators
  .filter(([, spec]) => spec.text)
  .map(([name]) => name);

export interface RouterOutcome {
  // The matched branch's name and 1-based index; null when none matched.
  branch: string | null;
  index: number | null;
}

// First match wins; no match takes "otherwise".
export function evaluateRouter(config: unknown): RouterOutcome {
  const branches = routerBranches(config);
  for (const [i, branch] of branches.entries()) {
    const name = routerBranchName(branch, i + 1);
    let matched: boolean;
    try {
      const { left, operator, right, caseSensitive } = branch;
      matched = evaluateBranch({ left, operator, right, caseSensitive }).result;
    } catch (error) {
      const reason =
        error instanceof BranchConfigError
          ? error.message.replace(/^Branch: /, "")
          : String(error);
      throw new Error(`Router: branch "${name}": ${reason}`, {
        cause: error,
      });
    }
    if (matched) return { branch: name, index: i + 1 };
  }
  return { branch: null, index: null };
}

export const routerAction = withPorts(
  createAction({
    name: ROUTER_ACTION,
    displayName: "Router",
    description:
      "Continues on the first branch whose condition holds, else on " +
      "Otherwise. Each branch tests one value, as Branch does.",
    requireAuth: false,
    props: {
      branches: Property.Array({
        displayName: "Branches",
        description: "Tested in order; the first that holds is taken.",
        required: true,
        properties: {
          name: Property.ShortText({
            displayName: "Name",
            description: "Labels the branch's port.",
            required: false,
          }),
          left: Property.ShortText({
            displayName: "Value",
            description: "What to test, usually an expression.",
            required: true,
            placeholder: "{{steps.fetch.output.status}}",
          }),
          operator: Property.StaticDropdown({
            displayName: "Condition",
            description: "How the value is tested.",
            required: true,
            defaultValue: DEFAULT_BRANCH_OPERATOR,
            options: {
              options: operators.map(([value, spec]) => ({
                value,
                label: spec.label,
              })),
            },
          }),
          right: withHints(
            Property.ShortText({
              displayName: "Compared with",
              description: "The value the condition compares to.",
              required: true,
            }),
            shownWhen("operator", BINARY_OPERATORS),
          ),
          caseSensitive: withHints(
            Property.Checkbox({
              displayName: "Case sensitive",
              description: "Match letter case exactly.",
              required: false,
            }),
            shownWhen("operator", TEXT_OPERATORS),
          ),
        },
      }),
    },
    run: (ctx) => Promise.resolve(evaluateRouter(ctx.propsValue)),
  }),
  {
    ports: routerPorts(undefined),
    portOf: (output) => {
      const { index } = output as RouterOutcome;
      return index === null ? OTHERWISE_PORT : routerBranchPort(index);
    },
  },
);

export class LoopItemsError extends Error {
  constructor(message: string) {
    super(`Loop: ${message}`);
    this.name = "LoopItemsError";
  }
}

// The items a loop runs over; anything but a list fails the step.
export function loopItems(config: unknown): unknown[] {
  const items =
    config !== null && typeof config === "object"
      ? (config as Record<string, unknown>).items
      : undefined;
  if (Array.isArray(items)) return items;
  const got =
    items === undefined || items === null
      ? "nothing"
      : `${typeof items} ${JSON.stringify(items).slice(0, 60)}`;
  throw new LoopItemsError(`items must be a list, got ${got}`);
}

export const loopAction = withPorts(
  createAction({
    name: LOOP_ACTION,
    displayName: "Loop on items",
    description:
      "Runs the steps under For each item once per item, in order, then " +
      "continues After loop. Those steps read the current item and its " +
      "index (from 1) from this step's output.",
    requireAuth: false,
    props: {
      items: Property.ShortText({
        displayName: "Items",
        description: "An expression that resolves to a list.",
        required: true,
        placeholder: "{{steps.fetch.output.rows}}",
      }),
    },
    run: (ctx) => {
      const items = loopItems(ctx.propsValue);
      return Promise.resolve({ count: items.length, items });
    },
  }),
  { ports: LOOP_PORTS, portOf: () => NEXT_PORT },
);
