import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";
import React from "react";
import type { TabContentProps } from "./tab-content.js";

// Radix derives element ids from the tab value; spaces produce invalid aria ids.
const toTabValue = (label: string) => label.trim().replace(/\s+/g, "-");

export function Tabs({
  children,
  defaultValue,
}: {
  children: React.ReactNode;
  defaultValue: string;
}) {
  return (
    <Root
      defaultValue={toTabValue(defaultValue)}
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <div className="flex w-full shrink-0 justify-between">
        <List className="flex w-full gap-x-2 rounded-xl p-1 text-sm font-semibold text-foreground outline-none">
          {React.Children.map(children, (child, _i) => {
            if (!React.isValidElement(child)) return;
            const { label, disabled } = child.props as TabContentProps;
            return (
              <Trigger
                className="flex min-h-7 flex-1 items-center justify-center rounded-lg border border-border bg-background py-2 text-foreground transition duration-300 data-disabled:disabled-effect data-[state=active]:bg-accent data-[state=active]:text-foreground"
                key={label as string}
                value={toTabValue(label as string)}
                disabled={disabled ?? false}
              >
                {label as string}
              </Trigger>
            );
          })}
        </List>
      </div>
      <div className="mt-3 min-h-0 flex-1 rounded-md bg-background">
        {React.Children.map(children, (child, i) => {
          if (!React.isValidElement(child)) return;
          const { label } = child.props as TabContentProps;
          return (
            <Content
              className="h-full"
              value={toTabValue(label as string)}
              key={i}
            >
              {child}
            </Content>
          );
        })}
      </div>
    </Root>
  );
}
