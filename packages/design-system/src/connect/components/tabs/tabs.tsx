import { Content, List, Root, Trigger } from "@radix-ui/react-tabs";
import React from "react";
import { type TabContentProps } from "./tab-content";

export function Tabs({
  children,
  defaultValue,
}: {
  children: React.ReactNode;
  defaultValue: string;
}) {
  return (
    <Root defaultValue={defaultValue} className="flex flex-col gap-2">
      <div className="flex w-full justify-between">
        {/* <EditorUndoRedoButtons {...props} /> */}
        <List className="flex w-full gap-x-2 rounded-xl bg-slate-50 p-1 text-sm font-semibold text-gray-600 outline-none">
          {React.Children.map(children, (child, i) => {
            if (!React.isValidElement(child)) return;
            const { label, disabled } = child.props as TabContentProps;
            return (
              <Trigger
                className="data-[state='active']:tab-shadow ata-disabled:cursor-not-allowed data-disabled:text-gray-400 flex h-7 flex-1 items-center justify-center rounded-lg transition duration-300 data-[state='active']:bg-gray-50 data-[state='active']:text-gray-900"
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
      <div className="mt-3 rounded-md bg-white">
        {React.Children.map(children, (child, i) => {
          if (!React.isValidElement(child)) return;
          const { label } = child.props as TabContentProps;
          return (
            <Content value={label as string} key={i}>
              {child}
            </Content>
          );
        })}
      </div>
    </Root>
  );
}
