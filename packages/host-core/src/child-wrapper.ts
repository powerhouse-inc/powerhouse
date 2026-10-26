import type { ChildWrapper, HostDefinition } from "./host-schemas.js";

/** A member's host.js with its wrapper applied, tokens unresolved. */
export type MemberDraft = Record<string, unknown> & {
  name: string;
  runner: HostDefinition["runner"];
};

/** Generic compound rule: `reactor`/`config` replace, `runner` key-merges. */
export function applyChildWrapper(
  base: HostDefinition,
  wrapper: ChildWrapper,
): MemberDraft {
  const reactor = wrapper.reactor ?? base.reactor;
  const config = wrapper.config ?? base.config;
  return {
    ...base,
    runner: { ...base.runner, ...wrapper.runner },
    ...(config !== undefined ? { config } : {}),
    ...(reactor !== undefined ? { reactor } : {}),
  };
}
