import { Icon, Modal } from "@/powerhouse";
import React, { ComponentPropsWithoutRef, useState } from "react";
import { twMerge } from "tailwind-merge";

export type SettingsTab = {
  id: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  content: React.ReactNode | (() => React.ReactNode);
};

export type SettingsModalProps = ComponentPropsWithoutRef<typeof Modal> & {
  readonly title: React.ReactNode;
  readonly tabs: SettingsTab[];
};

export const SettingsModal: React.FC<SettingsModalProps> = (props) => {
  const {
    title,
    overlayProps,
    contentProps,
    onOpenChange,
    tabs,
    ...restProps
  } = props;

  const [selectedTab, setSelectedTab] = useState(tabs.at(0)?.id);

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

  const SelectedTabContent = tabs.find(
    (tab) => tab.id === selectedTab,
  )?.content;

  return (
    <Modal
      contentProps={{
        ...contentProps,
        className: twMerge("rounded-xl", contentProps?.className),
      }}
      onOpenChange={onOpenChange}
      overlayProps={{
        ...overlayProps,
        className: twMerge("top-10", overlayProps?.className),
      }}
      {...restProps}
    >
      <div className="flex h-screen max-h-[700px] w-screen max-w-[900px] flex-col text-gray-900">
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
          <div className="m-6 flex max-h-full flex-1 flex-col overflow-hidden rounded-lg border border-slate-50 bg-gray-50">
            {typeof SelectedTabContent === "function" ? (
              <SelectedTabContent />
            ) : (
              SelectedTabContent
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
