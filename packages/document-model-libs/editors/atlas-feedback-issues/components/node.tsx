import type { RawViewNode, ViewNode } from "@powerhousedao/mips-parser";
import { useCallback, useState } from "react";
import { twJoin } from "tailwind-merge";
import { NodeOptionsCombobox } from "./node-options-combobox";
import { Issue } from "document-models/atlas-feedback-issues";
import { makeViewNodeTitleText } from "../utils";

type Props = {
  viewNode: ViewNode;
  issue: Issue | null;
  issues: Issue[];
  level?: number;
  tempIsDisplay?: boolean;
  onSelectNotionId: (notionId: string) => void;
};

export function Node(props: Props) {
  const {
    viewNode,
    onSelectNotionId,
    tempIsDisplay = false,
    level = 0,
  } = props;
  const notionId = viewNode.slugSuffix;
  const [open, setOpen] = useState(!tempIsDisplay);
  const hasSubDocuments = viewNode.subDocuments.length > 0;
  const isCategory = viewNode.type === "category";
  const title = isCategory
    ? viewNode.title.title
    : makeViewNodeTitleText(viewNode as RawViewNode);
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

  const onNodeTitleClick = useCallback(() => {
    setOpen((prev) => !prev);
    if (tempIsDisplay) return;

    onSelectNotionId(notionId);
  }, [tempIsDisplay, notionId, onSelectNotionId]);

  return (
    <div className="w-80">
      <div
        className="flex items-center justify-between"
        style={{ marginLeft: `${(level ?? 0) * 8}px` }}
      >
        <div className="flex items-center gap-1" onClick={onNodeTitleClick}>
          {title}
          {hasSubDocuments && chevron}
        </div>
        <div>
          <NodeOptionsCombobox {...props} />
        </div>
      </div>
      {open && (
        <div>
          <ul>
            {viewNode.subDocuments.map((subDocument) => (
              <li key={subDocument.slugSuffix}>
                <Node {...props} viewNode={subDocument} level={level + 1} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
