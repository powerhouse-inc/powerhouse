/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { Reducer, StateReducer } from "document-model";
import { createReducer, isDocumentAction } from "document-model";
import type { ConnectionPHState } from "document-models/connection/v1";

import { connectionConfigOperations } from "../src/reducers/config.js";
import { connectionConnectionOperations } from "../src/reducers/connection.js";
import { connectionHealthOperations } from "../src/reducers/health.js";

import {
  RecordCheckResultInputSchema,
  RemoveSecretRefInputSchema,
  SetAccountLabelInputSchema,
  SetConfigInputSchema,
  SetConnectionNameInputSchema,
  SetConnectorInputSchema,
  SetSecretRefInputSchema,
} from "./schema/zod.js";

const schemaMemo = new Map<() => unknown, unknown>();

function memoizedSchema<T>(makeSchema: () => T): T {
  let schema = schemaMemo.get(makeSchema) as T | undefined;
  if (schema === undefined) {
    schema = makeSchema();
    schemaMemo.set(makeSchema, schema);
  }
  return schema;
}

const stateReducer: StateReducer<ConnectionPHState> = (
  state,
  action,
  dispatch,
) => {
  if (isDocumentAction(action)) {
    return state;
  }
  switch (action.type) {
    case "SET_CONNECTION_NAME": {
      memoizedSchema(SetConnectionNameInputSchema).parse(action.input);

      connectionConnectionOperations.setConnectionNameOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_CONNECTOR": {
      memoizedSchema(SetConnectorInputSchema).parse(action.input);

      connectionConnectionOperations.setConnectorOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_ACCOUNT_LABEL": {
      memoizedSchema(SetAccountLabelInputSchema).parse(action.input);

      connectionConnectionOperations.setAccountLabelOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_CONFIG": {
      memoizedSchema(SetConfigInputSchema).parse(action.input);

      connectionConfigOperations.setConfigOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "SET_SECRET_REF": {
      memoizedSchema(SetSecretRefInputSchema).parse(action.input);

      connectionConfigOperations.setSecretRefOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "REMOVE_SECRET_REF": {
      memoizedSchema(RemoveSecretRefInputSchema).parse(action.input);

      connectionConfigOperations.removeSecretRefOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    case "RECORD_CHECK_RESULT": {
      memoizedSchema(RecordCheckResultInputSchema).parse(action.input);

      connectionHealthOperations.recordCheckResultOperation(
        (state as any)[action.scope],
        action as any,
        dispatch,
      );

      break;
    }

    default:
      return state;
  }
};

export const reducer: Reducer<ConnectionPHState> = createReducer(stateReducer);
