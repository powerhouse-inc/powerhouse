import { Operation } from "document-model/document-model";
import { createContext, useContext, useEffect, useState } from "react";
import {
  hiddenQueryTypeDefDoc,
  typeDefsDoc,
  initialSchema,
} from "../constants/documents";
import { buildSchema, GraphQLSchema } from "graphql";

type TSchemaContext = GraphQLSchema;

type TSchemaContextProps = {
  globalStateSchema: string;
  localStateSchema: string;
  operations: Operation[];
  children: React.ReactNode;
};

function buildSharedSchemaString(
  globalStateSchema: string,
  localStateSchema: string,
  operations: Operation[],
) {
  return [
    hiddenQueryTypeDefDoc,
    typeDefsDoc,
    globalStateSchema,
    localStateSchema,
    ...operations.map((operation) => operation.schema ?? ""),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildSharedSchema(
  globalStateSchema: string,
  localStateSchema: string,
  operations: Operation[],
) {
  try {
    return buildSchema(
      buildSharedSchemaString(globalStateSchema, localStateSchema, operations),
    );
  } catch (error) {
    console.error(error);
    return initialSchema;
  }
}

export const SchemaContext = createContext<TSchemaContext>(initialSchema);
export function SchemaContextProvider(props: TSchemaContextProps) {
  const { children, globalStateSchema, localStateSchema, operations } = props;
  const [sharedSchema, setSharedSchema] = useState(() =>
    buildSharedSchema(globalStateSchema, localStateSchema, operations),
  );

  useEffect(() => {
    setSharedSchema((prev) => {
      try {
        const newSchema = buildSharedSchema(
          globalStateSchema,
          localStateSchema,
          operations,
        );
        return newSchema;
      } catch (error) {
        return prev;
      }
    });
  }, [globalStateSchema, localStateSchema, operations]);

  return (
    <SchemaContext.Provider value={sharedSchema}>
      {children}
    </SchemaContext.Provider>
  );
}

export function useSchemaContext() {
  return useContext(SchemaContext);
}
