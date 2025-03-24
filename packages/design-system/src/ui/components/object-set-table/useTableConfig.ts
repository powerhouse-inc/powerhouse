import type { DataType, ObjectSetTableConfig } from "./types.js";

const useTableConfig = <T extends DataType>(
  config: ObjectSetTableConfig<T>,
) => {
  const internalApi = {};
  const publicApi = {};

  return {
    internalApi,
    publicApi,
  };
};

export { useTableConfig };
