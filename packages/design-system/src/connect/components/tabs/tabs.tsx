import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";
import React from "react";
import { twMerge } from "tailwind-merge";
import type { TabContentProps } from "./tab-content.js";

// Radix derives element ids from the tab value; spaces produce invalid aria ids.
const toTabValue = (label: string) => label.trim().replace(/\s+/g, "-");

// A child's tab value: the explicit `value` prop when given (required when the
// label is not a plain string, e.g. it embeds a changing count), otherwise the
// slugified label.
const resolveTabValue = (props: TabContentProps) =>
  props.value ?? toTabValue(props.label as string);

export function Tabs({
  children,
  defaultValue,
  onValueChange,
  listClassName,
}: {
  children: React.ReactNode;
  defaultValue: string;
  onValueChange?: (value: string) => void;
  /** Applied to the tab list row (not the panel content). */
  listClassName?: string;
}) {
  return (
    <Root
      defaultValue={toTabValue(defaultValue)}
      onValueChange={onValueChange}
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <div
        className={twMerge(
          "flex w-full shrink-0 justify-between",
          listClassName,
        )}
      >
        <List className="flex w-full gap-x-2 rounded-xl p-1 text-sm font-semibold text-foreground outline-none">
          {React.Children.map(children, (child, _i) => {
            if (!React.isValidElement(child)) return;
            const props = child.props as TabContentProps;
            const value = resolveTabValue(props);
            return (
              <Trigger
                className="flex min-h-7 flex-1 items-center justify-center rounded-lg border border-border bg-background py-2 text-foreground transition duration-300 data-disabled:disabled-effect data-[state=active]:bg-accent data-[state=active]:text-foreground"
                key={value}
                value={value}
                disabled={props.disabled ?? false}
              >
                {props.label}
              </Trigger>
            );
          })}
        </List>
      </div>
      <div className="mt-3 min-h-0 flex-1 rounded-md bg-background">
        {React.Children.map(children, (child, i) => {
          if (!React.isValidElement(child)) return;
          const value = resolveTabValue(child.props as TabContentProps);
          return (
            <Content className="h-full" value={value} key={i}>
              {child}
            </Content>
          );
        })}
      </div>
    </Root>
  );
}
