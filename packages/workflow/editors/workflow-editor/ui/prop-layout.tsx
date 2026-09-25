// Arranges a form's fields by the piece's layout hints: property groups
// (section, tabs, summary, builder, footer), checkbox reveals and half width.
import { Fragment, useState, type ReactNode } from "react";
import { IconButton, Select, Tabs } from "../../shared/controls.js";
import { Icon, isIconName } from "../../shared/icons.js";
import type { BlockFormProp, PropertyGroup } from "./forms.js";
import { isEmptyValue } from "./validation.js";

interface LayoutProps {
  props: BlockFormProp[];
  groups?: PropertyGroup[];
  values: Record<string, unknown>;
  renderField: (prop: BlockFormProp) => ReactNode;
  onCommit: (name: string, value: unknown) => void;
}

// Grouped where the group's first member is declared, not hoisted to the top,
// so a piece's own prop order still reads top to bottom.
const PLACED = new Set(["section", "tabs", "builder", "footer"]);

function chipText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(chipText).join(", ");
  return "set";
}

/** Consecutive `width: 'half'` fields share a row, two at a time. */
function Rows(props: { items: { prop: BlockFormProp; node: ReactNode }[] }) {
  const rows: ReactNode[] = [];
  let pending: { prop: BlockFormProp; node: ReactNode } | null = null;
  const flush = () => {
    if (pending)
      rows.push(<Fragment key={pending.prop.name}>{pending.node}</Fragment>);
    pending = null;
  };
  for (const item of props.items) {
    if (item.prop.width !== "half") {
      flush();
      rows.push(<Fragment key={item.prop.name}>{item.node}</Fragment>);
      continue;
    }
    if (!pending) {
      pending = item;
      continue;
    }
    const first: { prop: BlockFormProp; node: ReactNode } = pending;
    pending = null;
    rows.push(
      <div
        key={`${first.prop.name}+${item.prop.name}`}
        className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2"
      >
        <div className="min-w-0">{first.node}</div>
        <div className="min-w-0">{item.node}</div>
      </div>,
    );
  }
  flush();
  return <>{rows}</>;
}

// A checkbox and the fields it reveals while checked, indented beneath it.
function RevealCard(props: {
  checkbox: BlockFormProp;
  revealed: BlockFormProp[];
  layout: LayoutProps;
}) {
  const open = props.layout.values[props.checkbox.name] === true;
  return (
    <div className="flex flex-col gap-4">
      {props.layout.renderField(props.checkbox)}
      {open && props.revealed.length > 0 ? (
        <div className="flex flex-col gap-4 border-l-2 border-solid border-foreground/10 pl-3">
          <Rows
            items={props.revealed.map((prop) => ({
              prop,
              node: props.layout.renderField(prop),
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

// Fields of a list, reveals folded under their checkbox and halves paired.
function FieldList(props: { members: BlockFormProp[]; layout: LayoutProps }) {
  const byName = new Map(props.members.map((prop) => [prop.name, prop]));
  const revealedBy = new Map<string, BlockFormProp>();
  for (const prop of props.members) {
    for (const name of prop.reveals ?? []) {
      if (byName.has(name)) revealedBy.set(name, prop);
    }
  }
  const items = props.members
    .filter((prop) => !revealedBy.has(prop.name))
    .map((prop) => {
      const revealed = (prop.reveals ?? [])
        .map((name) => byName.get(name))
        .filter((entry): entry is BlockFormProp => entry !== undefined);
      return {
        prop,
        node:
          revealed.length > 0 ? (
            <RevealCard
              checkbox={prop}
              revealed={revealed}
              layout={props.layout}
            />
          ) : (
            props.layout.renderField(prop)
          ),
      };
    });
  return <Rows items={items} />;
}

function GroupHeading(props: { group: PropertyGroup }) {
  const { group } = props;
  if (!group.label && !group.description) return null;
  return (
    <div className="flex flex-col gap-0.5">
      {group.label ? (
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          {isIconName(group.icon) ? (
            <Icon
              name={group.icon}
              className="h-3.5 w-3.5 text-muted-foreground"
            />
          ) : null}
          {group.label}
        </span>
      ) : null}
      {group.description ? (
        <span className="text-xs text-muted-foreground">
          {group.description}
        </span>
      ) : null}
    </div>
  );
}

function Section(props: {
  group: PropertyGroup;
  members: BlockFormProp[];
  layout: LayoutProps;
}) {
  return (
    <section
      aria-label={props.group.label}
      className="flex flex-col gap-4 rounded-lg border border-solid border-foreground/10 p-4"
    >
      <GroupHeading group={props.group} />
      <FieldList members={props.members} layout={props.layout} />
    </section>
  );
}

// One member at a time; a dot marks tabs that hold a value.
function TabbedGroup(props: {
  group: PropertyGroup;
  members: BlockFormProp[];
  layout: LayoutProps;
}) {
  const [active, setActive] = useState(props.members[0]?.name ?? "");
  const current =
    props.members.find((prop) => prop.name === active) ?? props.members[0];
  if (!current) return null;
  return (
    <div className="flex flex-col gap-3">
      <GroupHeading group={props.group} />
      <div className="border-b border-solid border-foreground/10">
        <Tabs
          value={current.name}
          onChange={setActive}
          tabs={props.members.map((prop) => ({
            value: prop.name,
            label: prop.displayName,
            badge: isEmptyValue(props.layout.values[prop.name]) ? undefined : (
              <span
                aria-label="has a value"
                className="h-1.5 w-1.5 rounded-full bg-wf-run"
              />
            ),
          }))}
        />
      </div>
      {props.layout.renderField(current)}
    </div>
  );
}

// Filters: only the ones in use show, and "Add filter" offers the rest.
function BuilderGroups(props: {
  groups: PropertyGroup[];
  byName: Map<string, BlockFormProp>;
  layout: LayoutProps;
}) {
  const members = props.groups.flatMap((group) =>
    group.props
      .map((name) => props.byName.get(name))
      .filter((prop): prop is BlockFormProp => prop !== undefined),
  );
  const [added, setAdded] = useState<string[]>([]);
  const inUse = members.filter(
    (prop) =>
      prop.required ||
      added.includes(prop.name) ||
      !isEmptyValue(props.layout.values[prop.name]),
  );
  const available = members.filter((prop) => !inUse.includes(prop));
  return (
    <div className="flex flex-col gap-3">
      {props.groups.map((group) => (
        <GroupHeading key={group.key} group={group} />
      ))}
      {inUse.map((prop) => (
        <div key={prop.name} className="flex items-start gap-1">
          <div className="min-w-0 flex-1">{props.layout.renderField(prop)}</div>
          {prop.required ? null : (
            <IconButton
              icon="close"
              label={`Remove ${prop.displayName}`}
              className="mt-7"
              onClick={() => {
                setAdded((names) => names.filter((name) => name !== prop.name));
                props.layout.onCommit(prop.name, undefined);
              }}
            />
          )}
        </div>
      ))}
      {available.length > 0 ? (
        <div className="max-w-60">
          <Select
            options={available.map((prop) => ({
              value: prop.name,
              label: prop.displayName,
              description: prop.description,
            }))}
            value=""
            placeholder="Add filter"
            onChange={(name) => {
              if (name) setAdded((names) => [...names, name]);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

// Chips for what the form's sections hold, each clearable in place.
function Summary(props: { members: BlockFormProp[]; layout: LayoutProps }) {
  const set = props.members.filter(
    (prop) => !isEmptyValue(props.layout.values[prop.name]),
  );
  if (set.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Filters in use">
      {set.map((prop) => (
        <span
          key={prop.name}
          className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs text-foreground"
        >
          <span className="truncate">
            {prop.displayName}: {chipText(props.layout.values[prop.name])}
          </span>
          <button
            type="button"
            aria-label={`Clear ${prop.displayName}`}
            className="flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            onClick={() => props.layout.onCommit(prop.name, undefined)}
          >
            <Icon name="close" className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}

export function PropLayout(props: LayoutProps) {
  const groups = (props.groups ?? []).filter(
    (group) => PLACED.has(group.display) || group.display === "summary",
  );
  const byName = new Map(props.props.map((prop) => [prop.name, prop]));
  const groupOf = new Map<string, PropertyGroup>();
  for (const group of groups) {
    if (!PLACED.has(group.display)) continue;
    for (const name of group.props) {
      if (byName.has(name) && !groupOf.has(name)) groupOf.set(name, group);
    }
  }
  const membersOf = (group: PropertyGroup) =>
    group.props
      .map((name) => byName.get(name))
      .filter((prop): prop is BlockFormProp => prop !== undefined);
  const builderGroups = groups.filter((group) => group.display === "builder");
  const summaries = groups.filter((group) => group.display === "summary");
  const sectionMembers = groups
    .filter((group) => group.display === "section")
    .flatMap(membersOf);

  const blocks: ReactNode[] = [];
  let loose: BlockFormProp[] = [];
  const flushLoose = () => {
    if (loose.length === 0) return;
    blocks.push(
      <FieldList
        key={`loose:${loose[0].name}`}
        members={loose}
        layout={props}
      />,
    );
    loose = [];
  };
  // The summary sits just above the first section it summarises.
  const summarised = summaries.length > 0 && sectionMembers.length > 0;
  const placed = new Set<string>();
  for (const prop of props.props) {
    const group = groupOf.get(prop.name);
    if (!group) {
      loose.push(prop);
      continue;
    }
    const key = group.display === "builder" ? "builder" : group.key;
    if (placed.has(key)) continue;
    placed.add(key);
    flushLoose();
    if (group.display === "builder") {
      blocks.push(
        <BuilderGroups
          key="builder"
          groups={builderGroups}
          byName={byName}
          layout={props}
        />,
      );
    } else if (group.display === "tabs") {
      blocks.push(
        <TabbedGroup
          key={group.key}
          group={group}
          members={membersOf(group)}
          layout={props}
        />,
      );
    } else if (group.display === "footer") {
      blocks.push(
        <div
          key={group.key}
          className="flex flex-col gap-4 border-t border-solid border-foreground/10 pt-4"
        >
          <GroupHeading group={group} />
          <FieldList members={membersOf(group)} layout={props} />
        </div>,
      );
    } else {
      if (summarised && !placed.has("summary")) {
        placed.add("summary");
        blocks.push(
          <Summary key="summary" members={sectionMembers} layout={props} />,
        );
      }
      blocks.push(
        <Section
          key={group.key}
          group={group}
          members={membersOf(group)}
          layout={props}
        />,
      );
    }
  }
  flushLoose();
  return <>{blocks}</>;
}
