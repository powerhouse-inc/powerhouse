// Mounts PropertyForm over every prop type and layout hint, for the UI tests
// and screenshots: the real form and Connect's styles, resolvers stubbed.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  BlockFormProp,
  PropertyGroup,
} from "../../../editors/workflow-editor/ui/forms.js";
import { PropertyForm } from "../../../editors/workflow-editor/ui/PropertyForm.js";

const text = (name: string, extra: Partial<BlockFormProp> = {}) => ({
  name,
  displayName: name.charAt(0).toUpperCase() + name.slice(1),
  type: "SHORT_TEXT",
  required: false,
  ...extra,
});

export const KITCHEN_SINK: BlockFormProp[] = [
  {
    ...text("intro"),
    type: "MARKDOWN",
    description: "An **info** note, the default.",
  },
  {
    ...text("warning"),
    type: "MARKDOWN",
    variant: "WARNING",
    description: "This step **deletes** rows.",
  },
  {
    ...text("tip"),
    type: "MARKDOWN",
    variant: "TIP",
    description: "Tip: pick a channel first.",
  },
  {
    ...text("plain"),
    type: "MARKDOWN",
    variant: "BORDERLESS",
    description: "Borderless text.",
  },
  text("title", {
    required: true,
    placeholder: "e.g. Weekly report",
    icon: "pencil",
  }),
  text("firstName", { displayName: "First name", width: "half" }),
  text("lastName", { displayName: "Last name", width: "half" }),
  { ...text("body"), type: "LONG_TEXT" },
  {
    ...text("format"),
    type: "STATIC_DROPDOWN",
    staticOptions: [
      { label: "Plain", value: "plain" },
      { label: "Markdown", value: "markdown" },
      { label: "HTML", value: "html" },
    ],
  },
  { ...text("content"), type: "RICH_TEXT", formatProperty: "format" },
  { ...text("count"), type: "NUMBER", min: 0, max: 10 },
  {
    ...text("retries"),
    type: "NUMBER",
    display: "stepper",
    min: 0,
    max: 5,
    step: 1,
  },
  { ...text("notify"), type: "CHECKBOX", reveals: ["channel", "mention"] },
  text("channel", { displayName: "Channel" }),
  text("mention", { displayName: "Mention" }),
  {
    ...text("priority"),
    type: "STATIC_DROPDOWN",
    display: "cards",
    staticOptions: [
      { label: "Low", value: "low", description: "Batched daily" },
      { label: "High", value: "high", description: "Sent now", icon: "bolt" },
    ],
  },
  {
    ...text("region"),
    type: "STATIC_DROPDOWN",
    staticPlaceholder: "Connect an account first",
    staticDisabled: true,
    staticOptions: [],
  },
  { ...text("board"), type: "DROPDOWN", hasDynamicResolver: true },
  {
    ...text("user"),
    type: "DROPDOWN",
    hasDynamicResolver: true,
    refreshOnSearch: true,
  },
  {
    ...text("labels"),
    type: "STATIC_MULTI_SELECT_DROPDOWN",
    staticOptions: [
      { label: "Bug", value: "bug" },
      { label: "Feature", value: "feature" },
    ],
  },
  { ...text("period"), type: "DATE_RANGE" },
  { ...text("window"), type: "DATE_RANGE", display: "dropdown" },
  { ...text("due"), type: "DATE_TIME" },
  { ...text("colour"), type: "COLOR" },
  { ...text("to"), type: "ARRAY" },
  { ...text("cc"), type: "ARRAY" },
  { ...text("payload"), type: "JSON" },
  { ...text("widget"), type: "CUSTOM" },
  { ...text("headers"), type: "OBJECT" },
  {
    ...text("status"),
    type: "STATIC_DROPDOWN",
    staticOptions: [
      { label: "Open", value: "open" },
      { label: "Closed", value: "closed" },
    ],
  },
  { ...text("assignee"), displayName: "Assignee" },
  { ...text("timeout"), type: "NUMBER", advanced: true },
];

export const GROUPS: PropertyGroup[] = [
  {
    key: "recipients",
    display: "tabs",
    label: "Recipients",
    props: ["to", "cc"],
  },
  { key: "summary", display: "summary", props: [] },
  {
    key: "filters",
    display: "section",
    label: "Filters",
    description: "Narrow what comes back",
    props: ["status", "assignee"],
  },
];

// A board list for DROPDOWN, and a server-side search for refreshOnSearch.
function loadOptions(propName: string, _current: unknown, search?: string) {
  if (propName === "board") {
    return Promise.resolve({
      options: [
        { label: "Roadmap", value: "b1", description: "12 cards" },
        { label: "Support", value: "b2", description: "3 cards" },
      ],
    });
  }
  const people = ["Ada Lovelace", "Alan Turing", "Grace Hopper"];
  const found = people.filter((name) =>
    name.toLowerCase().includes((search ?? "").toLowerCase()),
  );
  return Promise.resolve({
    options: (search ? found : people.slice(0, 1)).map((name) => ({
      label: name,
      value: name.toLowerCase().replace(/\s+/g, "-"),
    })),
  });
}

function Harness(props: { initial: Record<string, unknown> }) {
  const [value, setValue] = useState(props.initial);
  return (
    <div className="flex gap-6 p-6">
      <div className="w-[400px] shrink-0 rounded-lg border border-solid border-foreground/10 bg-background p-4">
        <PropertyForm
          props={KITCHEN_SINK}
          groups={GROUPS}
          value={value}
          onChange={setValue}
          loadOptions={loadOptions}
        />
      </div>
      <pre data-testid="config" className="text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** Replaces the page with the harness; `initial` seeds the config. */
export function mount(initial: Record<string, unknown> = {}): void {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.className = "bg-background text-foreground min-h-screen overflow-auto";
  document.body.appendChild(root);
  createRoot(root).render(<Harness initial={initial} />);
}
