import {
  inspectProjectDefinitions,
  withSubgraphInspection,
} from "document-model/tooling";
import {
  type ModelRunOptions,
  processStreams,
  runModelCommand,
} from "./run.js";
import { renderInspectionReport } from "./render.js";
import { readProjectSubgraphs } from "./subgraphs.js";

type Selection = { readonly documentType: string; readonly version: number };

/** `<documentType>@<version>`; a document type may itself contain `@`. */
function parseModelSelector(
  selector: string,
):
  | { readonly ok: true; readonly selection: Selection }
  | { readonly ok: false; readonly message: string } {
  const at = selector.lastIndexOf("@");
  const documentType = at === -1 ? "" : selector.slice(0, at);
  const version = at === -1 ? "" : selector.slice(at + 1);
  if (
    documentType === "" ||
    !/^[1-9][0-9]*$/.test(version) ||
    !Number.isSafeInteger(Number(version))
  ) {
    return {
      ok: false,
      message: `Expected <documentType>@<version> with a positive whole version, such as acme/invoice@1. Received ${JSON.stringify(selector)}.`,
    };
  }
  return { ok: true, selection: { documentType, version: Number(version) } };
}

/** `ph model inspect [<documentType>@<version>]`. Returns the exit code. */
export async function runModelInspect(
  args: { readonly selector?: string; readonly json: boolean },
  options: ModelRunOptions = {},
): Promise<number> {
  let selection: Selection | undefined;
  if (args.selector !== undefined) {
    const parsed = parseModelSelector(args.selector);
    if (!parsed.ok) {
      (options.streams ?? processStreams).err(`${parsed.message}\n`);
      return 2;
    }
    selection = parsed.selection;
  }
  return await runModelCommand(
    {
      name: "ph model inspect",
      json: args.json,
      read: async (project, modules) => {
        if (selection !== undefined) {
          return inspectProjectDefinitions(project, { selection });
        }
        const report = inspectProjectDefinitions(project);
        const subgraphs = await readProjectSubgraphs(project, modules);
        return subgraphs === undefined
          ? report
          : withSubgraphInspection(project, report, subgraphs.input);
      },
      render: renderInspectionReport,
    },
    options,
  );
}
