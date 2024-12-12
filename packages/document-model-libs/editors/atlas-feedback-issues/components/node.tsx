import type { RawViewNode, ViewNode } from "@powerhousedao/mips-parser";
import { makeViewNodeTitleText } from "@powerhousedao/mips-parser/src";
import { useState } from "react";
import { twJoin } from "tailwind-merge";
type Props = {
  viewNode: ViewNode;
  level: number;
  filterNotionIds?: string[];
  onNodeClick?: (node: ViewNode) => void;
};
export function Node(props: Props) {
  const { viewNode, filterNotionIds, level, onNodeClick } = props;
  const shouldFilter = !!filterNotionIds;
  const [open, setOpen] = useState(shouldFilter);
  const hasSubDocuments = viewNode.subDocuments.length > 0;
  const supportingDocumentNodes = Object.values(
    viewNode.supportingDocuments,
  ).flat();
  const hasSupportingDocuments = supportingDocumentNodes.length > 0;
  const isCategory = viewNode.type === "category";
  const title = isCategory
    ? viewNode.title.title
    : makeViewNodeTitleText(viewNode as RawViewNode);
  const showTitle = getShowTitle();
  const chevron = (
    <svg
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={twJoin(
        "mt-0.5 w-3 flex-none transition",
        open && "rotate-180",
      )}
    >
      <path
        d="M3.13523 6.15803C3.3241 5.95657 3.64052 5.94637 3.84197 6.13523L7.5 9.56464L11.158 6.13523C11.3595 5.94637 11.6759 5.95657 11.8648 6.15803C12.0536 6.35949 12.0434 6.67591 11.842 6.86477L7.84197 10.6148C7.64964 10.7951 7.35036 10.7951 7.15803 10.6148L3.15803 6.86477C2.95657 6.67591 2.94637 6.35949 3.13523 6.15803Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      ></path>
    </svg>
  );

  function getShowTitle() {
    if (!shouldFilter) return true;
    if (
      isCategory &&
      filterNotionIds.some((id) => viewNode.descendantSlugSuffixes.includes(id))
    )
      return true;
    if (filterNotionIds.includes(viewNode.slugSuffix)) return true;
    return false;
  }

  return (
    <div>
      {showTitle && (
        <div
          onClick={() => {
            setOpen(!open);
            onNodeClick?.(viewNode);
          }}
          className="flex items-center gap-1"
        >
          {title}
          {(hasSubDocuments || hasSupportingDocuments) && chevron}
        </div>
      )}
      {open && (
        <div>
          <ul>
            {viewNode.subDocuments.map((subDocument) => (
              <li key={subDocument.slugSuffix}>
                <Node
                  level={level + 1}
                  viewNode={subDocument}
                  filterNotionIds={filterNotionIds}
                  onNodeClick={onNodeClick}
                />
              </li>
            ))}
          </ul>
          <ul>
            {supportingDocumentNodes.map((supportingDocument) => (
              <li key={supportingDocument.slugSuffix}>
                <Node
                  level={level + 1}
                  viewNode={supportingDocument}
                  filterNotionIds={filterNotionIds}
                  onNodeClick={onNodeClick}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
