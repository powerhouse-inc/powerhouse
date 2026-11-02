// The tree half of DataViewer, split out so @uiw/react-json-view loads only
// when a run's data is first shown.
import { JsonView } from "@uiw/react-json-view";
import { useState } from "react";
import { Icon } from "./icons.js";

function CopyButton(props: {
  text: string;
  label: string;
  icon: "braces" | "copy";
  // The hover group that reveals it.
  group: "key" | "value";
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      // Takes no space until hovered, so the colons stay aligned.
      className={`ml-1 hidden h-4 w-4 items-center justify-center rounded align-middle text-muted-foreground hover:bg-accent hover:text-foreground ${props.group === "key" ? "group-hover/key:inline-flex" : "group-hover/value:inline-flex"}`}
      onClick={(event) => {
        event.stopPropagation();
        void navigator.clipboard.writeText(props.text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <Icon name={copied ? "check" : props.icon} className="h-3 w-3" />
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
              <CopyButton
                text={`{{${props.root}.${keys.join(".")}}}`}
                label={`Copy {{${props.root}.${keys.join(".")}}}`}
                icon="braces"
                group="key"
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
            // Long values wrap, and the copy button takes the full value.
            <span className="group/value">
              <span {...rest}>{children}</span>
              {typeof value === "string" ? (
                <CopyButton
                  text={value}
                  label="Copy value"
                  icon="copy"
                  group="value"
                />
              ) : null}
            </span>
          )
        }
      />
    </JsonView>
  );
}
