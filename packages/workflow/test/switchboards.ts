// What a host hands the AI tools: a switchboard directory, and the reactor
// client's halves, in the tool context.
import type {
  ReactorBrowserHalves,
  SwitchboardDirectory,
  SwitchboardEntry,
} from "@powerhousedao/reactor-browser";
import type { AiToolContext } from "@powerhousedao/reactor-browser/ai";

/** A switchboard at `base` that runs workflows, unless told otherwise. */
export function switchboardAt(
  base: string,
  options: { name?: string; workflows?: SwitchboardEntry["workflows"] } = {},
): SwitchboardEntry {
  return {
    name: options.name ?? "sb",
    base,
    graphqlUrl: `${base}/graphql`,
    via: "backend",
    workflows: options.workflows ?? true,
  };
}

/** A directory of `entries`; `placed` maps a document id to a switchboard name. */
export function directoryOf(
  entries: SwitchboardEntry[],
  placed: Record<string, string> = {},
): SwitchboardDirectory {
  return {
    list: () => entries,
    locate: (documentId) =>
      Promise.resolve(
        entries.find((entry) => entry.name === placed[documentId]),
      ),
  };
}

/** A tool context over `entries` (default: one switchboard at http://sb). */
export function toolContext(
  options: {
    switchboards?: SwitchboardEntry[];
    placed?: Record<string, string>;
    reactorGet?: (id: string) => Promise<{ state: { global?: unknown } }>;
  } = {},
): AiToolContext {
  return {
    switchboards: directoryOf(
      options.switchboards ?? [switchboardAt("http://sb")],
      options.placed,
    ),
    ...(options.reactorGet
      ? {
          reactor: {
            read: { get: options.reactorGet },
          } as unknown as ReactorBrowserHalves,
        }
      : {}),
  };
}
