// The documents this Connect's drives hold, as picker options.

export interface DocumentOption {
  value: string;
  label: string;
  description?: string;
}

export interface DriveLike {
  header: { id: string; name?: string };
  state: {
    global: {
      name?: string;
      nodes: {
        id: string;
        name: string;
        kind: string;
        documentType?: string;
      }[];
    };
  };
}

export function documentOptions(
  drives: readonly DriveLike[],
): DocumentOption[] {
  const seen = new Map<string, DocumentOption>();
  for (const drive of drives) {
    const driveName = drive.state.global.name || drive.header.name || "";
    for (const node of drive.state.global.nodes) {
      if (node.kind.toUpperCase() !== "FILE" || seen.has(node.id)) continue;
      seen.set(node.id, {
        value: node.id,
        label: node.name || node.id,
        description: [node.documentType, driveName].filter(Boolean).join(" · "),
      });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}
