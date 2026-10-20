/** The statement a generated subgraphs/index.ts runs to refuse a host older than the subgraph protocol. */
export const hostGuard = (local: string) =>
  `if (!(Symbol.for("powerhouse.subgraph") in ${local})) {
  throw new Error(
    "This package's subgraphs need a newer host. Its @powerhousedao/reactor-api predates class-based subgraphs and would serve them under a placeholder name. Upgrade the host, or install a release of this package built for it.",
  );
}
`;
