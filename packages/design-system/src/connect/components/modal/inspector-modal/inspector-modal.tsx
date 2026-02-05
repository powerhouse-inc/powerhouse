import type { DivProps } from "@powerhousedao/design-system";
import { Icon, Modal } from "@powerhousedao/design-system";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";
import { DBExplorer, type DBExplorerProps } from "../../db-explorer/index.js";
import {
  QueueInspector,
  type QueueInspectorProps,
} from "../../queue-inspector/index.js";
import {
  RemotesInspector,
  type RemotesInspectorProps,
} from "../../remotes-inspector/index.js";
import { TabContent } from "../../tabs/tab-content.js";
import { Tabs } from "../../tabs/tabs.js";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type InspectorModalProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly modalProps?: ModalProps;
  readonly containerProps?: DivProps;
  readonly dbExplorerProps: DBExplorerProps;
  readonly remotesInspectorProps: RemotesInspectorProps;
  readonly queueInspectorProps?: QueueInspectorProps;
  readonly defaultTab?: "Database" | "Remotes" | "Queue";
};

export function InspectorModal({
  open,
  onOpenChange,
  modalProps,
  containerProps,
  dbExplorerProps,
  remotesInspectorProps,
  queueInspectorProps,
  defaultTab = "Database",
}: InspectorModalProps) {
  return (
    <Modal
      {...modalProps}
      contentProps={{
        className: "rounded-2xl",
        style: { height: "90vh", width: "90vw", maxWidth: "1400px" },
      }}
      onOpenChange={onOpenChange}
      open={open}
    >
      <div
        {...containerProps}
        className={twMerge(
          "flex h-full w-full flex-col",
          containerProps?.className,
        )}
      >
        <div className="flex shrink-0 items-center justify-end px-3 pt-3">
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-gray-500 outline-none hover:text-gray-900"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-3">
          <Tabs defaultValue={defaultTab}>
            <TabContent description="Database explorer" label="Database">
              <div className="h-full">
                <DBExplorer {...dbExplorerProps} />
              </div>
            </TabContent>
            <TabContent description="Remotes inspector" label="Remotes">
              <div className="h-full">
                <RemotesInspector {...remotesInspectorProps} />
              </div>
            </TabContent>
            {queueInspectorProps && (
              <TabContent description="Queue inspector" label="Queue">
                <div className="h-full">
                  <QueueInspector {...queueInspectorProps} />
                </div>
              </TabContent>
            )}
          </Tabs>
        </div>
      </div>
    </Modal>
  );
}
