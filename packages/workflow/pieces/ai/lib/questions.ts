import type { experimental_decide, Experimental_DecisionQuestion } from "ai";

// Not exported by `ai` 7.0.128.
export type DecisionState = Parameters<typeof experimental_decide>[0]["state"];

export const QUESTION_TYPES = ["choice", "score", "boolean"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function lines(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter((l) => l.trim());
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// "key: description" or a bare "key".
function splitOption(line: string): [string, string | null] {
  const at = line.indexOf(":");
  if (at < 0) return [line.trim(), null];
  const description = line.slice(at + 1).trim();
  return [line.slice(0, at).trim(), description || null];
}

function parseQuestion(
  row: Record<string, unknown>,
  label: string,
): Experimental_DecisionQuestion {
  const type = row.type ?? "choice";
  const instructions =
    typeof row.instructions === "string" ? row.instructions.trim() : "";
  if (!instructions) throw new Error(`${label}: instructions are required.`);
  const options = lines(row.options);

  switch (type) {
    case "choice": {
      if (options.length < 2) {
        throw new Error(`${label}: a choice needs at least two options.`);
      }
      // Null-prototype maps, so keys like "__proto__" stay plain keys.
      const criteria = Object.create(null) as Record<string, string | null>;
      for (const line of options) {
        const [key, description] = splitOption(line);
        if (!KEY_PATTERN.test(key)) {
          throw new Error(`${label}: option "${key}" is not a valid key.`);
        }
        if (Object.hasOwn(criteria, key)) {
          throw new Error(`${label}: option "${key}" appears twice.`);
        }
        criteria[key] = description;
      }
      return { type: "choice", instructions, criteria };
    }
    case "score": {
      if (options.length < 2) {
        throw new Error(`${label}: a score needs at least two levels.`);
      }
      return { type: "score", instructions, criteria: options };
    }
    case "boolean": {
      const criteria: { true?: string; false?: string } = {};
      for (const line of options) {
        const [key, description] = splitOption(line);
        if ((key === "true" || key === "false") && description) {
          criteria[key] = description;
        } else {
          throw new Error(
            `${label}: boolean options must be "true: ..." or "false: ...".`,
          );
        }
      }
      return Object.keys(criteria).length > 0
        ? { type: "boolean", instructions, criteria }
        : { type: "boolean", instructions };
    }
    default:
      throw new Error(
        `${label}: unknown type ${JSON.stringify(type)}. Expected ${QUESTION_TYPES.join(", ")}.`,
      );
  }
}

export function parseQuestions(
  rows: unknown,
): Record<string, Experimental_DecisionQuestion> {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("Add at least one question.");
  }
  const questions = Object.create(null) as Record<
    string,
    Experimental_DecisionQuestion
  >;
  rows.forEach((row, index) => {
    const fields =
      row !== null && typeof row === "object"
        ? (row as Record<string, unknown>)
        : {};
    const key = typeof fields.key === "string" ? fields.key.trim() : "";
    const label = `Question ${index + 1}${key ? ` (${key})` : ""}`;
    if (!KEY_PATTERN.test(key)) {
      throw new Error(
        `${label}: the key must start with a letter or underscore and use letters, digits, _ or -.`,
      );
    }
    if (Object.hasOwn(questions, key))
      throw new Error(`${label}: the key is used twice.`);
    questions[key] = parseQuestion(fields, label);
  });
  return questions;
}

// Text stays text; anything else goes as JSON, with arrays wrapped.
export function toDecisionState(input: unknown): DecisionState {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) throw new Error("The input is empty.");
    return trimmed;
  }
  if (input === undefined || input === null) {
    throw new Error("The input is empty.");
  }
  if (Array.isArray(input)) return { items: input };
  if (typeof input === "object") return input as DecisionState;
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }
  throw new Error("The input must be text or JSON.");
}
