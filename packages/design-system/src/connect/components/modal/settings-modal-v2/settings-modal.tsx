import type { ComponentProps } from "react";

import { Icon, Modal } from "#design-system";
import { useState } from "react";
import { twMerge } from "tailwind-merge";

export type SettingsTab = {
  id: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  content: React.ReactNode | React.ComponentType<any>;
};

type Props = {
  readonly title: React.ReactNode;
  readonly tabs: SettingsTab[];
  defaultTab?: string;
  navFooter?: React.ReactNode;
} & ComponentProps<typeof Modal>;

export function SettingsModal(props: Props) {
  const {
    title,
    overlayProps,
    contentProps,
    onOpenChange,
    tabs,
    defaultTab,
    navFooter,
    ...restProps
  } = props;

  const [selectedTab, setSelectedTab] = useState(defaultTab ?? tabs.at(0)?.id);

  const tabsContent = tabs.map((tab) => {
    const isActive = selectedTab === tab.id;

    return (
      <button
        type="button"
        key={tab.id}
        aria-current={isActive ? "page" : undefined}
        onClick={isActive ? undefined : () => setSelectedTab(tab.id)}
        className={twMerge(
          "flex h-9 w-48 items-center gap-x-2 rounded-md pl-3 text-left text-foreground",
          isActive
            ? "cursor-default bg-accent"
            : "cursor-pointer bg-transparent hover:bg-accent",
        )}
      >
        {tab.icon}
        <span>{tab.label}</span>
      </button>
    );
  });

  const selectedTabContent = tabs.find(
    (tab) => tab.id === selectedTab,
  )?.content;

  const SelectedTabComponent = selectedTabContent;

  return (
    <Modal
      contentProps={{
        ...contentProps,
        // Cap the height to the overlay's usable area (viewport minus the
        // overlay's py-28 = 14rem) so the modal never grows past the
        // viewport. Together with min-h-full this pins a definite height,
        // letting inner panels flex-fill and scroll instead of stretching
        // the whole modal.
        className: twMerge(
          "flex max-h-[calc(100dvh-14rem)] min-h-full w-full max-w-4xl flex-col rounded-xl",
          contentProps?.className,
        ),
      }}
      onOpenChange={onOpenChange}
      overlayProps={{
        ...overlayProps,
        className: twMerge("py-28", overlayProps?.className),
      }}
      {...restProps}
    >
      <div className="flex justify-between rounded-t-xl border-b border-border p-4">
        <h1 className="text-center text-xl font-semibold text-foreground">
          {title}
        </h1>
        <button
          type="button"
          aria-label="Close"
          className="flex size-6 items-center justify-center rounded-md text-foreground outline-none"
          onClick={() => onOpenChange?.(false)}
        >
          <Icon name="XmarkLight" size={24} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex flex-col p-3 pt-6">
          <div className="flex flex-col gap-y-1">{tabsContent}</div>
          {navFooter && (
            <div className="mt-auto border-t border-border pt-2">
              {navFooter}
            </div>
          )}
        </div>
        <div className="m-6 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
          {typeof SelectedTabComponent === "function" ? (
            <SelectedTabComponent />
          ) : (
            SelectedTabComponent
          )}
        </div>
      </div>
    </Modal>
  );
}
