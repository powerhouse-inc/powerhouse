import { Icon } from "@powerhousedao/design-system";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import type { ColumnInfo } from "./table-view.js";

export type TableInfo = {
  readonly name: string;
  readonly columns: ColumnInfo[];
};

type TreeExpandedState = Record<string, boolean>;

export type SchemaTreeSidebarProps = {
  readonly schema: string;
  readonly tables: TableInfo[];
  readonly selectedTable?: string;
  readonly onSelectTable: (table: string) => void;
};

type TreeItemProps = {
  readonly label: string;
  readonly depth: number;
  readonly expanded?: boolean;
  readonly selected?: boolean;
  readonly hasChildren?: boolean;
  readonly icon?: React.ReactNode;
  readonly onToggle?: () => void;
  readonly onClick?: () => void;
  readonly children?: React.ReactNode;
};

const INDENT_PX = 16;

function TreeItem({
  label,
  depth,
  expanded,
  selected,
  hasChildren,
  icon,
  onToggle,
  onClick,
  children,
}: TreeItemProps) {
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle?.();
  };

  return (
    <div>
      <div
        className={twMerge(
          "flex cursor-pointer items-center gap-1 py-1 pr-2 text-sm hover:bg-gray-100",
          selected && "bg-blue-50",
        )}
        style={{ paddingLeft: depth * INDENT_PX + 4 }}
        onClick={onClick}
      >
        {hasChildren ? (
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center text-gray-500 hover:text-gray-700"
            onClick={handleChevronClick}
            type="button"
          >
            <Icon
              className={twMerge(
                "transition-transform",
                expanded && "rotate-90",
              )}
              name="CaretRight"
              size={12}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        {icon && <span className="shrink-0 text-gray-500">{icon}</span>}
        <span className="truncate text-gray-700">{label}</span>
        {selected && (
          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-500" />
        )}
      </div>
      {expanded && children}
    </div>
  );
}

function ColumnItem({
  column,
  depth,
}: {
  readonly column: ColumnInfo;
  readonly depth: number;
}) {
  const typeLabel =
    column.dataType.length > 10
      ? column.dataType.slice(0, 10) + "…"
      : column.dataType;

  return (
    <div
      className="flex items-center gap-1 py-0.5 pr-2 text-xs text-gray-500"
      style={{ paddingLeft: depth * INDENT_PX + 4 }}
    >
      <span className="w-4 shrink-0" />
      <span className="truncate">{column.name}</span>
      <span className="ml-auto shrink-0 text-gray-400">({typeLabel})</span>
    </div>
  );
}

export function SchemaTreeSidebar({
  schema,
  tables,
  selectedTable,
  onSelectTable,
}: SchemaTreeSidebarProps) {
  const [expandedNodes, setExpandedNodes] = useState<TreeExpandedState>({
    [schema]: true,
  });

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId],
    }));
  };

  const handleTableClick = (tableName: string) => {
    onSelectTable(tableName);
    setExpandedNodes((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  const isSchemaExpanded = expandedNodes[schema] ?? false;

  return (
    <div className="flex flex-col overflow-auto text-sm">
      <TreeItem
        depth={0}
        expanded={isSchemaExpanded}
        hasChildren={tables.length > 0}
        icon={
          <Icon
            name={isSchemaExpanded ? "FolderOpen" : "FolderClose"}
            size={16}
          />
        }
        label={schema}
        onClick={() => toggleNode(schema)}
        onToggle={() => toggleNode(schema)}
      >
        {tables.map((table) => {
          const isTableExpanded = expandedNodes[table.name] ?? false;
          const isSelected = selectedTable === table.name;

          return (
            <TreeItem
              key={table.name}
              depth={1}
              expanded={isTableExpanded}
              hasChildren={table.columns.length > 0}
              icon={<Icon name="TreeViewSlash" size={16} />}
              label={table.name}
              selected={isSelected}
              onClick={() => handleTableClick(table.name)}
              onToggle={() => toggleNode(table.name)}
            >
              {table.columns.map((col) => (
                <ColumnItem key={col.name} column={col} depth={2} />
              ))}
            </TreeItem>
          );
        })}
      </TreeItem>
    </div>
  );
}
