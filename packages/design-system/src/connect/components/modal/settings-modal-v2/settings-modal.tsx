import { Icon, Modal } from "@/powerhouse";
import React, { ComponentProps, useState } from "react";
import { twMerge } from "tailwind-merge";
import { T } from "vitest/dist/chunks/environment.LoooBwUu.js";
import { About } from "./about";
import { DangerZone } from "./danger-zone";
import { DefaultEditor } from "./default-editor";
import { PackageManager } from "./package-manager";

export type SettingsTab = {
  id: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  content: React.ComponentType<any>;
};

type Props = {
  readonly title: React.ReactNode;
  readonly tabs: SettingsTab[];
  defaultTab?: string;
} & ComponentProps<typeof Modal> &
  ComponentProps<typeof About> &
  ComponentProps<typeof DefaultEditor> &
  ComponentProps<typeof DangerZone> &
  ComponentProps<typeof PackageManager>;

export function SettingsModal(props: Props) {
  const {
    title,
    overlayProps,
    contentProps,
    onOpenChange,
    tabs,
    defaultTab,
    ...restProps
  } = props;

  const [selectedTab, setSelectedTab] = useState(defaultTab ?? tabs.at(0)?.id);

  const tabsContent = tabs.map((tab) => (
    <button onClick={() => setSelectedTab(tab.id)} key={tab.id}>
      <div
        className={twMerge(
          "flex h-9 w-48 cursor-pointer items-center gap-x-2 rounded-md pl-3 hover:bg-slate-50",
          selectedTab === tab.id ? "bg-slate-50" : "bg-transparent",
        )}
      >
        {tab.icon}
        <span>{tab.label}</span>
      </div>
    </button>
  ));

  const selectedTabContent = tabs.find(
    (tab) => tab.id === selectedTab,
  )!.content;

  const SelectedTabComponent = selectedTabContent;

  return (
    <Modal
      contentProps={{
        ...contentProps,
        className: twMerge(
          "min-h-full w-full max-w-4xl rounded-xl",
          contentProps?.className,
        ),
        style: {
          ...contentProps?.style,
          boxShadow:
            "0px 0px 16px 4px rgba(0, 0, 0, 0.04), 0px 33px 32px -16px rgba(0, 0, 0, 0.10)",
        },
      }}
      onOpenChange={onOpenChange}
      overlayProps={{
        ...overlayProps,
        className: twMerge("py-28", overlayProps?.className),
      }}
      {...restProps}
    >
      <div className="flex justify-between border-b border-slate-50 p-4">
        <h1 className="text-center text-xl font-semibold">{title}</h1>
        <button
          className="flex size-6 items-center justify-center rounded-md outline-none"
          onClick={() => onOpenChange?.(false)}
        >
          <Icon name="XmarkLight" size={24} />
        </button>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col gap-y-1 p-3 pt-6">{tabsContent}</div>
        <div className="m-6 flex h-full flex-1 flex-col overflow-hidden rounded-lg border border-slate-50">
          <SelectedTabComponent {...restProps} />
        </div>
      </div>
    </Modal>
  );
}
