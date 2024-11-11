import { Operation } from "document-model/document-model";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { hiddenQueryTypeDefDoc, initialSchema } from "../constants/documents";
import { buildSchema, GraphQLSchema } from "graphql";
import { isDocumentString } from "@graphql-tools/utils";

type TSchemaContext = {
  sharedSchema: GraphQLSchema;
  getDocument: (id: string) => string;
  updateSharedSchema: (
    id: string,
    newDoc: string,
  ) =>
    | {
        success: true;
      }
    | {
        success: false;
        errors: string;
      };
  handleSchemaErrors: (
    id: string,
    newDoc: string,
  ) =>
    | {
        success: true;
        schema: GraphQLSchema;
      }
    | {
        success: false;
        errors: string;
      };
};

type TSchemaContextProps = {
  globalStateSchema: string;
  localStateSchema: string;
  operations: Operation[];
  children: React.ReactNode;
};

export const SchemaContext = createContext<TSchemaContext>({
  sharedSchema: initialSchema,
  getDocument: () => "",
  updateSharedSchema: () => ({ success: true }),
  handleSchemaErrors: () => ({ success: true, schema: initialSchema }),
});
export function SchemaContextProvider(props: TSchemaContextProps) {
  const { children, globalStateSchema, localStateSchema, operations } = props;
  const [sharedSchema, setSharedSchema] = useState(initialSchema);
  const [documents, setDocuments] = useState(new Map<string, string>());

  useEffect(() => {
    setDocuments((prev) => {
      const newDocuments = new Map<string, string>(prev);
      newDocuments.set("standard-lib", hiddenQueryTypeDefDoc);
      newDocuments.set("global", globalStateSchema);
      newDocuments.set("local", localStateSchema);
      for (const operation of operations) {
        if (operation.schema) {
          newDocuments.set(operation.id, operation.schema);
        }
      }
      return newDocuments;
    });
  }, [globalStateSchema, localStateSchema, operations]);

  const handleSchemaErrors: TSchemaContext["handleSchemaErrors"] = useCallback(
    (id: string, newDoc: string) => {
      if (!isDocumentString(newDoc)) return { success: false, errors: "" };
      const newDocuments = new Map(documents);
      newDocuments.set(id, newDoc);
      try {
        const newSchemaString = Array.from(newDocuments.values()).join("\n");
        const newSharedSchema = buildSchema(newSchemaString);
        return {
          success: true,
          schema: newSharedSchema,
        };
      } catch (e) {
        return {
          success: false,
          errors: (e as Error).message,
        };
      }
    },
    [documents],
  );

  const updateSharedSchema: TSchemaContext["updateSharedSchema"] = useCallback(
    (id: string, newDoc: string) => {
      const result = handleSchemaErrors(id, newDoc);

      if (result.success) {
        setSharedSchema(result.schema);
      }
      return result;
    },
    [handleSchemaErrors],
  );

  const value = useMemo(
    () => ({
      sharedSchema,
      documents,
      getDocument: (id: string) => documents.get(id) ?? "",
      handleSchemaErrors,
      updateSharedSchema,
    }),
    [sharedSchema, documents, handleSchemaErrors],
  );

  return (
    <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>
  );
}

export function useSchemaContext() {
  return useContext(SchemaContext);
}
