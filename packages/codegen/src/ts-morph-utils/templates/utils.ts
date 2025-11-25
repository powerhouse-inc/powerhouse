/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
export function getInitialStates(scopeState: { global: any; local: any }) {
  const { global, local } = scopeState;
  const scopes = { global, local };

  Object.entries(scopes).forEach(([scope, state]) => {
    if (!isEmptyStateSchema(state.schema) && state.initialValue === "") {
      throw new Error(
        `${
          scope.charAt(0).toLocaleUpperCase() + scope.slice(1)
        } scope has a defined schema but is missing an initial value.`,
      );
    }
  });

  return {
    initialGlobalState: handleEmptyState(global.initialValue),
    initialLocalState: handleEmptyState(local.initialValue),
  };
}

function isEmptyStateSchema(schema: string | string[]) {
  return schema === "" || !schema.includes("{");
}

function handleEmptyState(state: string) {
  return state === "" ? "{}" : state;
}
