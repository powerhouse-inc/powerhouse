// The tree half of DataViewer, split out so @uiw/react-json-view loads only
// when a run's data is first shown.
import { JsonView } from "@uiw/react-json-view";
import { useState } from "react";
import { Icon } from "./icons.js";

function CopyReference(props: { expression: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${props.expression}`}
      aria-label={`Copy ${props.expression}`}
      // Takes no space until hovered, so the colons stay aligned.
      className="ml-1 hidden h-4 w-4 items-center justify-center rounded align-middle text-muted-foreground hover:bg-accent hover:text-foreground group-hover/key:inline-flex"
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(props.expression).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Icon name={copied ? "check" : "braces"} className="h-3 w-3" />
    </button>
  );
}

// Short lists and small objects open by default at any depth.
function smallNode(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return true;
  return Object.keys(value).length <= 5;
}

export default function DataTree(props: { value: object; root?: string }) {
  return (
    <JsonView
      className="wf-data-tree"
      value={props.value}
      shouldExpandNodeInitially={(_expanded, { value, level }) =>
        level <= 2 || smallNode(value)
      }
      displayDataTypes={false}
      displayObjectSize
      enableClipboard={false}
      highlightUpdates={false}
      shortenTextAfterLength={80}
      indentWidth={16}
    >
      {/* Keys read as labels, not JSON strings. */}
      <JsonView.Quote render={() => <span hidden />} />
      <JsonView.Colon style={{ marginRight: "0.75ch" }} />
      <JsonView.KeyName
        render={({ children, ...rest }, { keys }) => (
          <span {...rest} className="group/key">
            {children}
            {props.root && keys && keys.length > 0 ? (
              <CopyReference
                expression={`{{${props.root}.${keys.join(".")}}}`}
              />
            ) : null}
          </span>
        )}
      />
      <JsonView.String
        render={({ children, ...rest }, { value }) =>
          value === "" ? (
            <span
              {...rest}
              className="rounded bg-muted px-1 font-sans text-[11px] text-muted-foreground"
            >
              empty
            </span>
          ) : (
            <span {...rest}>{children}</span>
          )
        }
      />
    </JsonView>
  );
}
