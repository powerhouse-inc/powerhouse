// Output ports a block declares. Descriptors carry them; the editor draws
// only these, and the runtime warns about an edge on any other.

export const NEXT_PORT = "next";
export const ERROR_PORT = "error";

// Every piece action: it succeeds onto "next" or fails onto "error".
export const PIECE_ACTION_PORTS: readonly string[] = [NEXT_PORT, ERROR_PORT];

// A trigger starts the run on "next".
export const TRIGGER_PORTS: readonly string[] = [NEXT_PORT];

// The ports that carry the flow on; "error" is a failure route.
export function flowPorts(ports: readonly string[]): string[] {
  return ports.filter((port) => port !== ERROR_PORT);
}

export interface PortedEdge {
  id: string;
  from: string;
  port: string;
}

// Edges leaving on a port their source does not declare. A source whose
// ports are not known (undefined) is not judged.
export function undeclaredPortEdges<E extends PortedEdge>(
  edges: readonly E[],
  portsOf: (sourceId: string) => readonly string[] | undefined,
): E[] {
  return edges.filter((edge) => {
    const ports = portsOf(edge.from);
    return ports !== undefined && !ports.includes(edge.port);
  });
}
