import { createAction, Property } from "@powerhousedao/pieces-framework";
import {
  BRANCH_PORTS,
  NEXT_PORT,
  PIECE_ACTION_PORTS,
} from "@powerhousedao/pieces-framework/workflow";
import {
  BRANCH_OPERATORS,
  DEFAULT_BRANCH_OPERATOR,
  evaluateBranch,
  type BranchOutcome,
} from "./branch-operators.js";
import { shownWhen, withHints, withPorts } from "./hints.js";

const operators = Object.entries(BRANCH_OPERATORS);
const BINARY_OPERATORS = operators
  .filter(([, spec]) => spec.binary)
  .map(([name]) => name);
const TEXT_OPERATORS = operators
  .filter(([, spec]) => spec.text)
  .map(([name]) => name);

export const branchAction = withPorts(
  createAction({
    name: "branch",
    displayName: "Branch",
    description:
      "Takes the true port when the operator holds for its operands, else the " +
      "false port. An operand of the wrong type (a number operator on text, a " +
      "list operator on something that is not a list) fails the step.",
    requireAuth: false,
    props: {
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
    run: (ctx) => Promise.resolve(evaluateBranch(ctx.propsValue)),
  }),
  {
    ports: BRANCH_PORTS,
    portOf: (output) => ((output as BranchOutcome).result ? "true" : "false"),
  },
);

function assertionText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

function normalizedList(entries: unknown): string[] {
  const list =
    typeof entries === "string"
      ? [entries]
      : Array.isArray(entries)
        ? entries
        : [];
  return list
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean);
}

// Model output is the motivating case: an empty completion, or a classifier
// answering the wrong question, must not flow on to a step with a side effect.
export const assertAction = withPorts(
  createAction({
    name: "assert",
    displayName: "Assert",
    description:
      "Fails the step when its value is blank or rejected, so a bad value stops " +
      "the run instead of reaching a step with a side effect.",
    requireAuth: false,
    props: {
      value: Property.ShortText({
        displayName: "Value",
        description:
          "e.g. {{steps.describe.output}} - the run fails when it is blank.",
        required: true,
      }),
      rejectValues: Property.Array({
        displayName: "Rejected values",
        description:
          "One per line; the run fails when the value matches any of them.",
        required: false,
      }),
      allowValues: Property.Array({
        displayName: "Allowed values",
        description:
          "One per line; when set, anything else fails. Safer than a reject list for model output.",
        required: false,
      }),
      allowEmpty: Property.Checkbox({
        displayName: "Allow empty",
        description: "Accept a blank value instead of failing.",
        required: false,
      }),
      message: Property.ShortText({
        displayName: "Failure message",
        description: "Replaces the default error.",
        required: false,
      }),
    },
    run: (ctx) => {
      const { value, rejectValues, allowValues, allowEmpty, message } =
        ctx.propsValue as Record<string, unknown>;
      const trimmed = assertionText(value).trim();
      const fail = (reason: string) =>
        Promise.reject(
          new Error(
            typeof message === "string" && message
              ? message
              : `Assert: ${reason}`,
          ),
        );
      if (!trimmed && allowEmpty !== true) return fail("value is empty");
      if (normalizedList(rejectValues).includes(trimmed.toLowerCase())) {
        return fail(`value is a rejected value ("${trimmed}")`);
      }
      // An allow-list is the safer gate for model output: anything unforeseen
      // fails here rather than reaching a step that writes.
      const allowed = normalizedList(allowValues);
      if (allowed.length > 0 && !allowed.includes(trimmed.toLowerCase())) {
        return fail(
          `value "${trimmed}" is not one of the allowed values (${allowed.join(", ")})`,
        );
      }
      return Promise.resolve({ value });
    },
  }),
  { ports: PIECE_ACTION_PORTS, portOf: () => NEXT_PORT },
);
