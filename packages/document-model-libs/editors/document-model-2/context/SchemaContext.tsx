import { Module } from "document-model/document-model";
import { buildASTSchema, GraphQLSchema, parse } from "graphql";
import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  hiddenQueryTypeDefDoc,
  initialSchema,
  initialStateDoc,
  LOCAL_STATE_DOC_ID,
  STATE_DOC_ID,
} from "../constants/documents";
import { getTypeOptions } from "../lib/forms";
import { useStore } from "@tanstack/react-store";
import { docStore } from "../store/docStore";
import { moduleStore } from "../store/moduleStore";

type TSchemaContext = {
  schema: GraphQLSchema;
  allDocs: string[];
  allDocNames: string[];
  sharedDoc: string;
  globalStateDoc: string;
  localStateDoc: string | undefined;
  hasLocalState: boolean;
  modules: Module[];
  moduleDocs: string[];
  existingOperationNames: string[];
  existingTypeNames: string[];
  existingModuleNames: string[];
};

export const SchemaContext = createContext<TSchemaContext>({
  schema: initialSchema,
  allDocs: [],
  allDocNames: [],
  sharedDoc: "",
  globalStateDoc: initialStateDoc,
  localStateDoc: undefined,
  hasLocalState: false,
  modules: [],
  existingOperationNames: [],
  moduleDocs: [],
  existingTypeNames: [],
  existingModuleNames: [],
});

export const useSchema = () => useContext(SchemaContext);

export function SchemaProvider(props: { children: ReactNode }) {
  const { children } = props;
  const [schema, setSchema] = useState(initialSchema);
  const allDocNames = useStore(docStore, (state) => Array.from(state.keys()));
  const allDocs = useStore(docStore, (state) => Array.from(state.values()));
  const sharedDoc = allDocs.join("\n");
  const localStateDoc = useStore(docStore, (state) =>
    state.get(LOCAL_STATE_DOC_ID),
  );
  const globalStateDoc = useStore(docStore, (state) =>
    state.get(STATE_DOC_ID),
  )!;
  const hasLocalState = localStateDoc !== undefined;
  const modules = useStore(moduleStore, (state) => Array.from(state.values()));
  const existingOperationNames = modules.flatMap((module) =>
    module.operations.map((op) => op.name!),
  );
  const moduleDocs = useStore(docStore, (state) =>
    existingOperationNames.map((name) => state.get(name)).filter(Boolean),
  );
  const existingTypeNames = getTypeOptions(schema);
  const existingModuleNames = modules.map((m) => m.name);
  console.log({ allDocs, allDocNames });

  useEffect(() => {
    try {
      const combinedTypeDefs = [hiddenQueryTypeDefDoc, sharedDoc].join("\n");
      const ast = parse(combinedTypeDefs);
      const newSchema = buildASTSchema(ast);
      setSchema(newSchema);
    } catch (error) {
      return;
    }
  }, [sharedDoc]);

  const value = useMemo(
    () => ({
      schema,
      allDocs,
      allDocNames,
      sharedDoc,
      globalStateDoc,
      localStateDoc,
      hasLocalState,
      modules,
      existingOperationNames,
      moduleDocs,
      existingTypeNames,
      existingModuleNames,
    }),
    [
      schema,
      allDocs,
      allDocNames,
      sharedDoc,
      globalStateDoc,
      localStateDoc,
      hasLocalState,
      modules,
      existingOperationNames,
      moduleDocs,
      existingTypeNames,
      existingModuleNames,
    ],
  );

  return (
    <SchemaContext.Provider value={value}>{children}</SchemaContext.Provider>
  );
}
