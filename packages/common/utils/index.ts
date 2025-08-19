import { type Operation } from "document-model";

export const getRevisionFromDate = (
  startDate?: Date,
  endDate?: Date,
  operations: Operation[] = [],
) => {
  if (!startDate || !endDate) return 0;

  const operation = operations.find((operation) => {
    const operationDate = new Date(operation.timestampUtcMs);
    return operationDate >= startDate && operationDate <= endDate;
  });

  return operation ? operation.index : 0;
};
