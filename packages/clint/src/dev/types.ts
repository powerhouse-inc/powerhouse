/**
 * Build-pipeline types, ported from ph-clint-dev. The CLI-metadata coupling
 * (BuildConfig.cli.getMetadata) stays in the old repo — in the monorepo the
 * pipeline is driven by paths + an optional agents manifest (see
 * build-skills.ts), which is what the mastra-runner's `build` verb feeds it.
 */

export interface ResolvedBuildConfig {
  /** All include directories (prompt template sources). */
  include: string[];
  /** Output directories for skills and agent instructions. */
  output: string[];
  /** Build-time context (Handlebars variables). */
  context: Record<string, unknown>;
  /** Agent profiles to concatenate. */
  agentProfiles: AgentProfile[];
  /** Skill descriptions by skill id. */
  skillDescriptions: Record<string, string>;
  /** Subdirectory name overrides. */
  subdirs?: {
    profiles?: string;
    skillsTpl?: string;
    skillsExt?: string;
  };
  /** Additional Handlebars helpers. */
  customHelpers?: Record<string, (...args: unknown[]) => unknown>;
  /** Remove output directories before building. */
  clean: boolean;
  /** Logger function. */
  logger: (msg: string) => void;
}

/** An agent profile — concatenates template sections into one instruction file. */
export interface AgentProfile {
  name: string;
  sections: string[];
}
