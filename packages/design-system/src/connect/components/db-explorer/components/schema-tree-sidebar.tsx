import { Icon } from "#design-system";
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
  readonly onRefresh?: () => void | Promise<void>;
  readonly loading?: boolean;
};

type TreeItemProps = {
  readonly label: React.ReactNode;
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
          "flex cursor-pointer items-center gap-1 py-1 pr-2 text-sm hover:hover-effect",
          selected && "bg-info/10",
        )}
        style={{ paddingLeft: depth * INDENT_PX + 4 }}
        onClick={onClick}
      >
        {hasChildren ? (
          <button
            className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:hover-effect"
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
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <span className="min-w-0 flex-1 truncate text-foreground">{label}</span>
        {selected && (
          <span className="ml-auto size-2 shrink-0 rounded-full bg-info" />
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
      className="flex items-center gap-1 py-0.5 pr-2 text-xs text-muted-foreground"
      style={{ paddingLeft: depth * INDENT_PX + 4 }}
    >
      <span className="w-4 shrink-0" />
      <span className="truncate">{column.name}</span>
      <span className="ml-auto shrink-0 text-muted-foreground">
        ({typeLabel})
      </span>
    </div>
  );
}

export function SchemaTreeSidebar({
  schema,
  tables,
  selectedTable,
  onSelectTable,
  onRefresh,
  loading,
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

  const handleRefreshClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void onRefresh?.();
  };

  return (
    <div className="flex flex-col overflow-auto pt-4 text-sm">
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
        label={
          <div className="flex flex-1 items-center">
            <span className="truncate">{schema}</span>
            {onRefresh && (
              <button
                className="ml-auto p-0.5 text-muted-foreground hover:hover-effect"
                onClick={handleRefreshClick}
                type="button"
                disabled={loading}
              >
                <Icon
                  name="Reload"
                  size={14}
                  className={loading ? "animate-spin" : undefined}
                />
              </button>
            )}
          </div>
        }
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
