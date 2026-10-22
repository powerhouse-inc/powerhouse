import { PluginError } from "@powerhousedao/host-core/plugins";
import { z } from "zod";

/**
 * Validate a built-in plugin's entry config against its configSchema, the way
 * host-core's resolveHostPlugins does on the server: a failure names the
 * plugin and every offending key instead of surfacing a bare ZodError from
 * the runtime-config load.
 */
export function parseEntryConfig<S extends z.ZodType>(
  specifier: string,
  schema: S,
  rawConfig: unknown,
): z.output<S> {
  const parsed = schema.safeParse(rawConfig);
  if (!parsed.success) {
    throw new PluginError(
      `config for Connect plugin "${specifier}" is invalid:\n` +
        z.prettifyError(parsed.error),
      `Fix the entry's config in the host's runner.plugins.`,
    );
  }
  return parsed.data;
}
