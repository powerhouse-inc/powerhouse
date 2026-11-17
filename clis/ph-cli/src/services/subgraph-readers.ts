import { projectModuleReferences } from "./project-module-references.js";

/** Readers outside the relative import graph that codegen can rewrite. */
export function subgraphReaders(projectDir: string): {
  /** Subgraph files read from outside their directory. */
  readonly imported: ReadonlySet<string>;
  /** Those of them some outside reader reads whole. */
  readonly readWhole: ReadonlySet<string>;
} {
  const found = new Set<string>();
  const whole = new Set<string>();
  for (const reference of projectModuleReferences(projectDir)) {
    const isRelative = /^\.{1,2}\//.test(reference.specifier);
    for (const target of reference.targets) {
      const parts = target.path.split("/");
      const [top, name] = parts;
      if (top !== "subgraphs" || parts.length < 2) continue;
      if (
        !target.throughPackage &&
        isRelative &&
        reference.file.startsWith(`subgraphs/${name}/`)
      )
        continue;
      found.add(target.path);
      if (reference.whole) whole.add(target.path);
    }
  }
  return { imported: found, readWhole: whole };
}
