import { Operation } from "document-model/document-model";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  hiddenQueryTypeDefDoc,
  typeDefsDoc,
  initialSchema,
  specialDocIds,
} from "../constants/documents";
import { buildSchema, GraphQLSchema, parse } from "graphql";
import { isDocumentString } from "@graphql-tools/utils";
import { validateSDL } from "graphql/validation/validate";

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
  const [documents, setDocuments] = useState(() => {
    const newDocuments = new Map<string, string>();
    newDocuments.set(specialDocIds.hiddenQueryTypeDef, hiddenQueryTypeDefDoc);
    newDocuments.set(specialDocIds.standardLib, typeDefsDoc);
    newDocuments.set(specialDocIds.global, globalStateSchema);
    newDocuments.set(specialDocIds.local, localStateSchema);
    for (const operation of operations) {
      if (operation.schema) {
        newDocuments.set(operation.id, operation.schema);
      }
    }
    return newDocuments;
  });

  useEffect(() => {
    setDocuments((prev) => {
      const newDocuments = new Map<string, string>(prev);
      newDocuments.set(specialDocIds.hiddenQueryTypeDef, hiddenQueryTypeDefDoc);
      newDocuments.set(specialDocIds.standardLib, typeDefsDoc);
      newDocuments.set(specialDocIds.global, globalStateSchema);
      newDocuments.set(specialDocIds.local, localStateSchema);
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
      if (!isDocumentString(newDoc))
        return { success: false, errors: "Invalid document string" };
      const newDocuments = new Map(documents);
      newDocuments.set(id, newDoc);

      try {
        // Track starting line of the document we're validating
        let targetDocStartLine = 1;
        for (const [docId, content] of newDocuments.entries()) {
          if (docId === id) break;
          targetDocStartLine += content.split("\n").length;
        }
        const targetDocEndLine = targetDocStartLine + newDoc.split("\n").length;

        const newSchemaString = Array.from(newDocuments.values()).join("\n");
        const documentNode = parse(newSchemaString);

        const errors = validateSDL(documentNode);
        if (errors.length > 0) {
          // Filter errors to only those within our document's line range
          const relevantErrors = errors.filter((error) => {
            const errorLine = error.locations?.[0]?.line;
            return (
              errorLine != null &&
              errorLine >= targetDocStartLine &&
              errorLine < targetDocEndLine
            );
          });

          return {
            success: false,
            errors: relevantErrors.map((e) => e.message).join("\n"),
          };
        }

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
