import { Icon } from "@powerhousedao/design-system";
import { useCallback, useMemo, useState } from "react";
import { twMerge } from "tailwind-merge";
import { ConnectSelect } from "../../select/select.js";
import type {
  ColumnInfo,
  FilterClause,
  FilterGroup,
  FilterOperator,
} from "./table-view.js";

export type FilterBarProps = {
  readonly columns: ColumnInfo[];
  readonly filters: FilterGroup | undefined;
  readonly onFiltersChange: (filters: FilterGroup | undefined) => void;
};

function getAvailableOperators(column: ColumnInfo): FilterOperator[] {
  const baseOperators: FilterOperator[] = [
    "=",
    "!=",
    ">",
    "<",
    ">=",
    "<=",
    "IS NULL",
    "IS NOT NULL",
  ];

  const dataType = column.dataType.toLowerCase();

  // Text types get LIKE and ILIKE
  if (
    dataType.includes("varchar") ||
    dataType.includes("text") ||
    dataType.includes("char")
  ) {
    return [...baseOperators, "LIKE", "ILIKE"];
  }

  // Numeric types don't get LIKE/ILIKE
  if (
    dataType.includes("int") ||
    dataType.includes("decimal") ||
    dataType.includes("numeric") ||
    dataType.includes("real") ||
    dataType.includes("double") ||
    dataType.includes("float") ||
    dataType.includes("bigint") ||
    dataType.includes("smallint")
  ) {
    return baseOperators;
  }

  // Default: all operators except LIKE/ILIKE
  return baseOperators;
}

function getInputType(
  column: ColumnInfo,
  operator: FilterOperator,
): "text" | "number" | "datetime-local" {
  if (operator === "IS NULL" || operator === "IS NOT NULL") {
    return "text"; // Will be hidden anyway
  }

  const dataType = column.dataType.toLowerCase();

  if (
    dataType.includes("int") ||
    dataType.includes("decimal") ||
    dataType.includes("numeric") ||
    dataType.includes("real") ||
    dataType.includes("double") ||
    dataType.includes("float") ||
    dataType.includes("bigint") ||
    dataType.includes("smallint")
  ) {
    return "number";
  }

  if (
    dataType.includes("timestamp") ||
    dataType.includes("date") ||
    dataType.includes("time")
  ) {
    return "datetime-local";
  }

  return "text";
}

function FilterClauseComponent({
  clause,
  columns,
  onUpdate,
  onRemove,
  showConnector,
  connector,
  onConnectorChange,
}: {
  readonly clause: FilterClause;
  readonly columns: ColumnInfo[];
  readonly onUpdate: (clause: FilterClause) => void;
  readonly onRemove: () => void;
  readonly showConnector: boolean;
  readonly connector: "AND" | "OR";
  readonly onConnectorChange: (connector: "AND" | "OR") => void;
}) {
  const column = columns.find((c) => c.name === clause.column);
  const availableOperators = column
    ? getAvailableOperators(column)
    : (["=", "!="] as FilterOperator[]);
  const inputType = column ? getInputType(column, clause.operator) : "text";
  const showValueInput =
    clause.operator !== "IS NULL" && clause.operator !== "IS NOT NULL";

  const columnItems = useMemo(
    (): Array<{ value: string; displayValue: string }> =>
      columns.map((col) => ({
        value: col.name,
        displayValue: col.name,
      })),
    [columns],
  );

  const operatorItems = useMemo(
    (): Array<{ value: FilterOperator; displayValue: string }> =>
      availableOperators.map((op) => ({
        value: op,
        displayValue: op,
      })),
    [availableOperators],
  );

  const connectorItems = useMemo(
    (): Array<{ value: "AND" | "OR"; displayValue: string }> => [
      { value: "AND", displayValue: "AND" },
      { value: "OR", displayValue: "OR" },
    ],
    [],
  );

  const handleColumnChange = useCallback(
    (columnName: string) => {
      const newColumn = columns.find((c) => c.name === columnName);
      if (!newColumn) return;

      const newAvailableOperators = getAvailableOperators(newColumn);
      const newOperator = newAvailableOperators.includes(clause.operator)
        ? clause.operator
        : newAvailableOperators[0];

      onUpdate({
        ...clause,
        column: columnName,
        operator: newOperator,
        value: "",
      });
    },
    [clause, columns, onUpdate],
  );

  const handleOperatorChange = useCallback(
    (operator: FilterOperator) => {
      onUpdate({
        ...clause,
        operator,
        value:
          operator === "IS NULL" || operator === "IS NOT NULL"
            ? ""
            : clause.value,
      });
    },
    [clause, onUpdate],
  );

  const handleValueChange = useCallback(
    (value: string) => {
      onUpdate({
        ...clause,
        value,
      });
    },
    [clause, onUpdate],
  );

  return (
    <div className="flex items-center gap-2">
      {showConnector && (
        <ConnectSelect<"AND" | "OR">
          absolutePositionMenu
          borderRadius="4px"
          containerClassName="min-w-[80px]"
          id={`connector-${clause.id}`}
          items={connectorItems}
          itemClassName="px-2 py-1 text-xs"
          menuClassName="px-2 py-1 text-xs min-w-[80px]"
          value={connector}
          onChange={onConnectorChange}
        />
      )}
      <ConnectSelect<string>
        absolutePositionMenu
        borderRadius="4px"
        containerClassName="min-w-[150px]"
        id={`column-${clause.id}`}
        items={columnItems}
        itemClassName="px-2 py-1 text-xs"
        menuClassName="px-2 py-1 text-xs min-w-[150px]"
        value={clause.column}
        onChange={handleColumnChange}
      />
      <ConnectSelect<FilterOperator>
        absolutePositionMenu
        borderRadius="4px"
        containerClassName="min-w-[100px]"
        id={`operator-${clause.id}`}
        items={operatorItems}
        itemClassName="px-2 py-1 text-xs"
        menuClassName="px-2 py-1 text-xs min-w-[100px]"
        value={clause.operator}
        onChange={handleOperatorChange}
      />
      {showValueInput && (
        <input
          className="min-w-[150px] rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
          type={inputType}
          value={clause.value}
          onChange={(e) => handleValueChange(e.target.value)}
        />
      )}
      <button
        className="flex items-center justify-center rounded p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
        onClick={onRemove}
        title="Remove filter"
        type="button"
      >
        <Icon name="Xmark" size={14} />
      </button>
    </div>
  );
}

export function FilterBar({
  columns,
  filters,
  onFiltersChange,
}: FilterBarProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAddFilter = useCallback(() => {
    const newClause: FilterClause = {
      id: `filter-${Date.now()}-${Math.random()}`,
      column: columns[0]?.name ?? "",
      operator: "=",
      value: "",
    };

    if (!filters) {
      onFiltersChange({
        clauses: [newClause],
        connectors: [],
      });
    } else {
      onFiltersChange({
        clauses: [...filters.clauses, newClause],
        connectors: [
          ...filters.connectors,
          filters.clauses.length > 0 ? "AND" : ("AND" as const),
        ],
      });
    }
    setIsExpanded(true);
  }, [columns, filters, onFiltersChange]);

  const handleUpdateClause = useCallback(
    (index: number, clause: FilterClause) => {
      if (!filters) return;

      const newClauses = [...filters.clauses];
      newClauses[index] = clause;

      onFiltersChange({
        ...filters,
        clauses: newClauses,
      });
    },
    [filters, onFiltersChange],
  );

  const handleRemoveClause = useCallback(
    (index: number) => {
      if (!filters) return;

      const newClauses = filters.clauses.filter((_, i) => i !== index);
      const newConnectors = filters.connectors.filter(
        (_, i) => i !== index - 1,
      );

      if (newClauses.length === 0) {
        onFiltersChange(undefined);
      } else {
        onFiltersChange({
          clauses: newClauses,
          connectors: newConnectors,
        });
      }
    },
    [filters, onFiltersChange],
  );

  const handleConnectorChange = useCallback(
    (index: number, connector: "AND" | "OR") => {
      if (!filters) return;

      const newConnectors = [...filters.connectors];
      newConnectors[index] = connector;

      onFiltersChange({
        ...filters,
        connectors: newConnectors,
      });
    },
    [filters, onFiltersChange],
  );

  const hasFilters = filters && filters.clauses.length > 0;

  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-gray-300 bg-white p-2">
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900"
          onClick={() => setIsExpanded(!isExpanded)}
          type="button"
        >
          <Icon
            className={twMerge(
              "transition-transform",
              isExpanded && "rotate-90",
            )}
            name="ChevronDown"
            size={12}
          />
          <span>Filters</span>
          {hasFilters && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">
              {filters.clauses.length}
            </span>
          )}
        </button>
        <button
          className="flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
          onClick={handleAddFilter}
          type="button"
        >
          <Icon name="Plus" size={12} />
          Add Filter
        </button>
      </div>

      {isExpanded && hasFilters && (
        <div className="flex flex-col gap-2">
          {filters.clauses.map((clause, index) => (
            <FilterClauseComponent
              key={clause.id}
              clause={clause}
              columns={columns}
              connector={
                index > 0 ? (filters.connectors[index - 1] ?? "AND") : "AND"
              }
              onConnectorChange={(connector) =>
                handleConnectorChange(index - 1, connector)
              }
              onRemove={() => handleRemoveClause(index)}
              onUpdate={(updatedClause) =>
                handleUpdateClause(index, updatedClause)
              }
              showConnector={index > 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
