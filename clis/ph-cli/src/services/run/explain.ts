import {
  explainDrivePlan,
  loadHost,
  mergeDrivePlan,
  type DriveDeclaration,
} from "@powerhousedao/host-core";

/**
 * `ph run <host> --explain drives` (R1): print the merged drive plan with
 * provenance instead of running. Host-declared drives only for now — plugin
 * contributions join the merge when the pipelines land (R2+); the renderer
 * and provenance labels already carry them.
 */

interface ExplainOptions {
  host: string;
  topic: string;
}

interface ReactorSection {
  drives?: DriveDeclaration[];
}

interface ChildWrapper {
  host: string;
  reactor?: ReactorSection;
}

export async function explainHost(options: ExplainOptions): Promise<void> {
  if (options.topic !== "drives") {
    throw new Error(
      `Unknown --explain topic "${options.topic}" (supported: drives).`,
    );
  }
  const projectRoot = process.cwd();
  const loaded = await loadHost(projectRoot, options.host);
  const host = loaded.host;

  if (host.children !== undefined) {
    // Compound: one plan per member, with the wrapper's full-statement
    // semantics (wrapper reactor replaces the member's when present).
    const children = host.children as Record<string, ChildWrapper>;
    for (const [name, wrapper] of Object.entries(children)) {
      const member = await loadHost(projectRoot, wrapper.host);
      const reactor = (wrapper.reactor ??
        member.host.reactor ??
        {}) as ReactorSection;
      console.log(`[${options.host} › ${name} (${wrapper.host})]`);
      console.log(
        explainDrivePlan(mergeDrivePlan(projectRoot, reactor.drives ?? [], [])),
      );
    }
    return;
  }

  const reactor = (host.reactor ?? {}) as ReactorSection;
  console.log(`[${options.host}]`);
  console.log(
    explainDrivePlan(mergeDrivePlan(projectRoot, reactor.drives ?? [], [])),
  );
}
