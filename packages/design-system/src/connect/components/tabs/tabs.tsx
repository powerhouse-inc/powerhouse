import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";
import React from "react";
import type { TabContentProps } from "./tab-content.js";

export function Tabs({
  children,
  defaultValue,
}: {
  children: React.ReactNode;
  defaultValue: string;
}) {
  return (
    <Root
      defaultValue={defaultValue}
      className="flex min-h-0 flex-1 flex-col gap-2"
    >
      <div className="flex w-full shrink-0 justify-between">
        <List className="flex w-full gap-x-2 rounded-xl p-1 text-sm font-semibold text-gray-600 outline-none dark:text-slate-300">
          {React.Children.map(children, (child, i) => {
            if (!React.isValidElement(child)) return;
            const { label, disabled } = child.props as TabContentProps;
            return (
              <Trigger
                className="flex min-h-7 flex-1 items-center justify-center rounded-lg border border-gray-100 bg-gray-50 py-2 text-gray-800 transition duration-300 data-disabled:cursor-not-allowed data-disabled:text-gray-400 data-[state='active']:bg-gray-100 data-[state='active']:text-gray-900 dark:border-slate-600 dark:bg-slate-600 dark:text-slate-300 dark:data-disabled:text-slate-500 dark:data-[state='active']:bg-slate-500 dark:data-[state='active']:text-slate-100"
                key={label as string}
                value={label as string}
                disabled={disabled ?? false}
              >
                {label as string}
              </Trigger>
            );
          })}
        </List>
      </div>
      <div className="mt-3 min-h-0 flex-1 rounded-md bg-white dark:bg-slate-800">
        {React.Children.map(children, (child, i) => {
          if (!React.isValidElement(child)) return;
          const { label } = child.props as TabContentProps;
          return (
            <Content className="h-full" value={label as string} key={i}>
              {child}
            </Content>
          );
        })}
      </div>
    </Root>
  );
}
