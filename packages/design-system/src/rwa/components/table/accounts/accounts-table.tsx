import { Icon } from "@/powerhouse";
import { tableNames } from "@/rwa/constants";
import { useEditorContext } from "@/rwa/context";
import { TableColumn } from "@/rwa/types";
import { useCallback } from "react";
import { Fragment } from "react/jsx-runtime";
import { RWATableCell, RWATableRow, TableWithForm } from "../base";

export function AccountsTable() {
  const { accounts, principalLenderAccountId } = useEditorContext();
  const principalLenderAccount = accounts.find(
    (account) => account.id === principalLenderAccountId,
  );

  const renderPrincipalLenderRow = useCallback(
    (c: TableColumn[]) => (
      <RWATableRow>
        {c.map((column) => (
          <Fragment key={column.key}>
            {column.key === "label" ? (
              <RWATableCell>
                {principalLenderAccount?.label}
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-green-100 px-1 font-extralight">
                  Lender <Icon name="CheckCircle" size={14} />
                </span>
              </RWATableCell>
            ) : (
              <RWATableCell />
            )}
          </Fragment>
        ))}
      </RWATableRow>
    ),
    [principalLenderAccount?.label],
  );

  const specialFirstRow = principalLenderAccount?.label
    ? renderPrincipalLenderRow
    : undefined;

  return (
    <TableWithForm
      specialFirstRow={specialFirstRow}
      tableName={tableNames.ACCOUNT}
    />
  );
}
