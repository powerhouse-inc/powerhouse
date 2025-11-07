import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { Icon } from "../../../../powerhouse/components/icon/icon.js";
import { Branch } from "./branch.js";
import { DocId } from "./doc-id.js";
import { DocumentState } from "./document-state.js";
import { Scope } from "./scope.js";

interface Props extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  readonly title: ReactNode;
  readonly docId: string;
  readonly scope: string;
  readonly onChangeScope: (scope: string) => void;
  readonly onClose: () => void;
  readonly documentState?: object;
  readonly onCopyState?: () => void;
}

export function Header(props: Props) {
  const {
    title,
    docId,
    scope,
    onChangeScope,
    onClose,
    className,
    documentState,
    onCopyState,
    ...divProps
  } = props;
  return (
    <header
      className={twMerge(
        "flex items-center justify-between bg-transparent",
        className,
      )}
      {...divProps}
    >
      <div className="flex items-center gap-3">
        <button
          name="close-revision-history"
          className="shadow-button rounded-lg bg-gray-50 p-1 text-stone-300"
          onClick={onClose}
        >
          <Icon name="VariantArrowLeft" />
        </button>
        <h1 className="text-xs">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <DocId docId={docId} />
        {documentState && (
          <DocumentState
            documentState={documentState}
            onCopyState={onCopyState}
          />
        )}
        <Branch />
        <Scope onChange={onChangeScope} value={scope} />
      </div>
    </header>
  );
}
