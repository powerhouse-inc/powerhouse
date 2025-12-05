import type { DivProps } from "@powerhousedao/design-system";
import { Icon, Modal } from "@powerhousedao/design-system";
import type { ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";
import { DBExplorer, type DBExplorerProps } from "../../db-explorer/index.js";
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
  readonly defaultTab?: "Database" | "Remotes";
};

export function InspectorModal({
  open,
  onOpenChange,
  modalProps,
  containerProps,
  dbExplorerProps,
  remotesInspectorProps,
  defaultTab = "Database",
}: InspectorModalProps) {
  return (
    <Modal
      {...modalProps}
      contentProps={{
        className: "rounded-2xl",
      }}
      onOpenChange={onOpenChange}
      open={open}
    >
      <div
        {...containerProps}
        className={twMerge(
          "flex h-[600px] w-[900px] flex-col rounded-2xl",
          containerProps?.className,
        )}
      >
        <div className="flex items-center justify-end p-4 pb-0">
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-md text-gray-500 outline-none hover:text-gray-900"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <Icon name="XmarkLight" size={24} />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-4 pt-2">
          <Tabs defaultValue={defaultTab}>
            <TabContent description="Database explorer" label="Database">
              <div className="h-[480px]">
                <DBExplorer {...dbExplorerProps} />
              </div>
            </TabContent>
            <TabContent description="Remotes inspector" label="Remotes">
              <div className="h-[480px]">
                <RemotesInspector {...remotesInspectorProps} />
              </div>
            </TabContent>
          </Tabs>
        </div>
      </div>
    </Modal>
  );
}
