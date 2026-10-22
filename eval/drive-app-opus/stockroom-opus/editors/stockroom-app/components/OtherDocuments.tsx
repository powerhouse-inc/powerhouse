import { useLinkProps, useNodeTarget } from "@powerhousedao/reactor-browser";
import type { FileNode } from "@powerhousedao/shared/document-drive";

/** Documents that aren't inventory items: listed, openable, not totalled. */
export function OtherDocuments({ nodes }: { nodes: FileNode[] }) {
  return (
    <section data-testid="other-docs">
      <h2 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
        Other documents in this folder
      </h2>
      <ul className="border-border divide-border divide-y rounded-lg border text-sm">
        {nodes.map((node) => (
          <OtherDocument key={node.id} node={node} />
        ))}
      </ul>
    </section>
  );
}

function OtherDocument({ node }: { node: FileNode }) {
  const link = useLinkProps(useNodeTarget(node));
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <a {...link} className="truncate hover:underline">
        {node.name}
      </a>
      <span className="text-muted-foreground shrink-0 font-mono text-xs">
        {node.documentType}
      </span>
    </li>
  );
}
