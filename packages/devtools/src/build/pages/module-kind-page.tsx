import { useState, type CSSProperties, type ReactNode } from "react";
import type { ProjectSnapshot } from "../../api.js";
import type { DevtoolsFocus } from "../../shell/location.js";
import type { PanelProps } from "../../shell/registry.js";
import { useShell } from "../../shell/state.js";
import { ModuleDetail, type ModuleTab } from "../module-page/detail.js";
import {
  GenerateCommandButton,
  ModuleList,
  ModuleSwitcher,
} from "../module-page/list.js";
import type { PageModule } from "../module-page/text.js";
import { focusedModule, listedModuleTarget } from "../project/focus.js";
import { projectModules } from "../project/kinds.js";
import { EmptyKind, SectionError, WithProject } from "../project/parts.js";
import {
  ResizeHandle,
  storedWidth,
  useStoredWidth,
} from "../../ui/resize-handle.js";

export type ModulePageKind = PageModule["kind"];

export function ModuleKindPage({
  kind,
  focus,
}: PanelProps & { kind: ModulePageKind }) {
  return (
    <div
      data-testid="ph-module-page"
      data-kind={kind}
      className="flex min-h-0 min-w-0 flex-1 flex-col [&>[role=status]]:px-2 [&>[role=status]]:pt-2 @md/frame:[&>[role=status]]:px-3"
    >
      <WithProject>
        {(snapshot) => (
          <Modules kind={kind} focus={focus} snapshot={snapshot} />
        )}
      </WithProject>
    </div>
  );
}

function Modules({
  kind,
  focus,
  snapshot,
}: {
  kind: ModulePageKind;
  focus: DevtoolsFocus | undefined;
  snapshot: ProjectSnapshot;
}) {
  const { navigate } = useShell();
  // Kept while another module of the kind is chosen.
  const [tab, setTab] = useState<ModuleTab>("overview");
  const section = projectModules(snapshot, kind);
  if (!section.ok) {
    return (
      <Padded>
        <SectionError kind={kind} message={section.message} />
      </Padded>
    );
  }
  const linked = focusedModule(focus, section.items);
  const selected = linked ?? section.items[0];
  const select = (entry: PageModule) =>
    navigate(listedModuleTarget(kind, entry, section.items));
  if (!selected) {
    return (
      <Padded>
        <EmptyKind kind={kind} />
      </Padded>
    );
  }
  return (
    <Columns
      list={
        <ModuleList
          kind={kind}
          modules={section.items}
          selected={selected}
          linked={linked !== undefined}
          onSelect={select}
        />
      }
      detail={
        <ModuleDetail
          key={selected.module.folder}
          entry={selected}
          snapshot={snapshot}
          tab={tab}
          onTab={setTab}
          title={
            <span className="flex min-w-0 @max-3xl/split:text-base @max-3xl/split:font-semibold">
              {section.items.length > 1 ? (
                <>
                  <ModuleSwitcher
                    kind={kind}
                    modules={section.items}
                    selected={selected}
                    onSelect={select}
                    className="@3xl/split:hidden"
                  />
                  <span className="hidden @3xl/split:inline">
                    {selected.name}
                  </span>
                </>
              ) : (
                selected.name
              )}
            </span>
          }
          actions={
            <GenerateCommandButton kind={kind} className="@3xl/split:hidden" />
          }
        />
      }
    />
  );
}

function Padded({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2 @md/frame:p-3">
      {children}
    </div>
  );
}

const LIST_WIDTH = { initial: 288, min: 200, max: 480 };
const LIST_WIDTH_STORED = storedWidth("module-list-width", LIST_WIDTH);

/** The list beside the detail, each scrolling on its own, the list as wide
 * as the user dragged it. */
function Columns({ list, detail }: { list: ReactNode; detail: ReactNode }) {
  const [width, setWidth] = useStoredWidth(LIST_WIDTH_STORED, LIST_WIDTH);
  return (
    <div
      data-testid="ph-module-columns"
      style={{ "--ph-list-w": `${width}px` } as CSSProperties}
      className="@container/split relative grid min-h-0 flex-1 grid-cols-1 overflow-auto @3xl:grid-cols-[min(var(--ph-list-w),50%)_minmax(0,1fr)] @3xl:grid-rows-[minmax(0,1fr)] @3xl:overflow-hidden"
    >
      <div className="hidden min-w-0 p-2 @md/frame:p-3 @3xl:block @3xl:overflow-auto @3xl:border-r">
        {list}
      </div>
      <ResizeHandle
        label="Resize the list"
        data-testid="ph-module-list-resize"
        width={width}
        limits={LIST_WIDTH}
        onWidth={setWidth}
        className="absolute inset-y-0 left-[min(var(--ph-list-w),50%)] hidden @3xl:block"
      />
      <div className="flex min-w-0 flex-col p-2 @md/frame:p-3 @3xl:min-h-0 @3xl:overflow-auto">
        {detail}
      </div>
    </div>
  );
}
