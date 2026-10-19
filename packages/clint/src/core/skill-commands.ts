import { z } from "zod";
import type { Command, SkillConfig } from "./types.js";
import type { SkillInfo } from "./skills.js";
import { getSchemaFields } from "./schema.js";
import { extractTemplateVars } from "./templates.js";

/**
 * Default Handlebars template for skill instructions.
 */
export const DEFAULT_SKILL_INSTRUCTION =
  "Use your {{skillId}} skill for the following instructions: {{prompt}}";

/**
 * A skill invocation result — returned by skill commands to signal
 * that the dispatch layer should route to the agent with a skill prefix.
 */
export interface SkillInvocation {
  type: "skill-invocation";
  skillName: string;
  userMessage?: string;
  /** Handlebars template for rendering the agent instruction. */
  instructionTemplate?: string;
  /** Values for all input fields (prompt + any extra from inputSchema). */
  inputValues?: Record<string, unknown>;
}

/**
 * Type guard for SkillInvocation.
 */
export function isSkillInvocation(v: unknown): v is SkillInvocation {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as Record<string, unknown>).type === "skill-invocation"
  );
}

/**
 * Normalize a SkillConfig value — accepts plain string shorthand.
 */
function normalizeSkillConfig(value: string | SkillConfig): SkillConfig {
  return typeof value === "string" ? { description: value } : value;
}

/**
 * Input schema for skill commands — a single optional --prompt flag.
 */
const skillInputSchema = z.object({
  prompt: z.string().optional().describe("Instructions for the skill"),
});

/**
 * Validate that an instructionTemplate includes the {{prompt}} variable.
 * Returns a warning string if missing, or undefined if ok.
 */
function validateInstructionTemplate(
  skillName: string,
  template: string,
): string | undefined {
  const vars = extractTemplateVars(template);
  if (!vars.has("prompt")) {
    return `Skill "${skillName}": instructionTemplate does not include {{prompt}} — the user's message will not be forwarded to the agent`;
  }
  return undefined;
}

/**
 * Create CLI commands from skill metadata and optional skill configs.
 * Each skill becomes a thin command with a --prompt flag that returns a SkillInvocation.
 *
 * Emits warnings to stderr when a custom instructionTemplate omits {{prompt}}.
 */
export function createSkillCommands(
  skills: SkillInfo[],
  skillConfigs?: Record<string, string | SkillConfig>,
): Command<any, SkillInvocation>[] {
  return skills.map((skill) => {
    const rawConfig = skillConfigs?.[skill.name];
    const config = rawConfig ? normalizeSkillConfig(rawConfig) : undefined;
    const description =
      config?.description || skill.description || `Use the ${skill.name} skill`;

    // Warn at registration time if instructionTemplate omits {{prompt}}
    if (config?.instructionTemplate) {
      const warning = validateInstructionTemplate(
        skill.name,
        config.instructionTemplate,
      );
      if (warning) {
        console.warn(`[ph-clint] ${warning}`);
      }
    }

    // Merge custom inputSchema fields with the base prompt field
    let inputSchema: z.ZodType = skillInputSchema;
    if (config?.inputSchema && config.inputSchema instanceof z.ZodObject) {
      const extraFields = (config.inputSchema as z.ZodObject<any>).shape;
      const baseShape = (skillInputSchema as z.ZodObject<any>).shape;
      inputSchema = z.object({ ...baseShape, ...extraFields });
    }

    return {
      id: skill.name,
      description,
      inputSchema,
      execute: async (input: Record<string, unknown>) => ({
        type: "skill-invocation" as const,
        skillName: skill.name,
        userMessage: input.prompt as string | undefined,
        ...(config?.instructionTemplate && {
          instructionTemplate: config.instructionTemplate,
        }),
        inputValues: input,
      }),
    };
  });
}
