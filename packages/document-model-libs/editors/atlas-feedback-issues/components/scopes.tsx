import { ViewNode } from "@powerhousedao/mips-parser";
import { Node } from "./node";

type Props = {
  scopes: ViewNode[];
  filterNotionIds?: string[];
  onNodeClick?: (node: ViewNode) => void;
};

export function Scopes(props: Props) {
  const { scopes, filterNotionIds, onNodeClick } = props;
  return (
    <div>
      {scopes.map((scope) => (
        <Node
          key={scope.slugSuffix}
          viewNode={scope}
          level={0}
          filterNotionIds={filterNotionIds}
          onNodeClick={onNodeClick}
        />
      ))}
    </div>
  );
}
