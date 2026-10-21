import { editorRecipesGuideTemplate } from "./editor-recipes.md.js";

/** The guides that `AGENTS.md` links, keyed by their path in the project.
 * They hold optional patterns, so an agent loads one only when a task needs it. */
export const agentGuideTemplates: Readonly<Record<string, string>> = {
  "docs/agent-guides/editor-recipes.md": editorRecipesGuideTemplate,
};
