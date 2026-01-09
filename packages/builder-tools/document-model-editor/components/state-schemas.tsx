import { cn } from "@powerhousedao/design-system";
import { Checkbox } from "@powerhousedao/design-system/ui/components/checkbox/checkbox.js";
import { Kind } from "graphql";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { typeDefsDoc } from "../constants/documents.js";
import { safeParseSdl, useSchemaContext } from "../context/schema-context.js";
import type { Scope } from "../types/documents.js";
import {
  makeInitialSchemaDoc,
  makeMinimalObjectForStateType,
  makeStateSchemaNameForScope,
  StateValidationError,
  validateStateObject,
} from "../utils/helpers.js";
import { ensureValidStateSchemaName } from "../utils/linting.js";
import { Button } from "./button.js";
import { StateValidationErrorMessage } from "./state-error.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";
const GraphqlEditor = lazy(() => import("./code-editors/graphql-editor.js"));
const JSONEditor = lazy(() => import("./code-editors/json-editor.js"));
type Props = {
  modelName: string;
  globalStateSchema: string;
  localStateSchema: string;
  globalStateInitialValue: string;
  localStateInitialValue: string;
  setStateSchema: (doc: string, scope: Scope) => void;
  setInitialState: (doc: string, scope: Scope) => void;
  currentScope: Scope;
  onScopeChange: (scope: Scope) => void;
};

type StateEditorProps = {
  modelName: string;
  stateSchema: string;
  initialValue: string;
  setStateSchema: (doc: string, scope: Scope) => void;
  setInitialState: (doc: string, scope: Scope) => void;
  scope: Scope;
};

function StateEditor({
  modelName,
  stateSchema,
  initialValue,
  setStateSchema,
  setInitialState,
  scope,
}: StateEditorProps) {
  const { sharedSchema: sharedSchemaSdl, error: sharedSchemaError } =
    useSchemaContext();
  const [showStandardLib, setShowStandardLib] = useState(false);
  const [syncWithSchema, setSyncWithSchema] = useState(true);

  const customLinter = useCallback(
    (doc: string) => ensureValidStateSchemaName(doc, modelName, scope),
    [modelName, scope],
  );

  const schemaErrors = useMemo(() => {
    const errors = ensureValidStateSchemaName(stateSchema, modelName, scope);
    if (sharedSchemaError) {
      return [...errors, sharedSchemaError];
    }
    return errors;
  }, [stateSchema, modelName, scope, sharedSchemaError]);

  const handleToggleStandardLib = useCallback(() => {
    setShowStandardLib((prev) => !prev);
  }, []);

  const handleSchemaUpdate = useCallback(
    (newDoc: string) => setStateSchema(newDoc, scope),
    [setStateSchema, scope],
  );

  const handleInitialStateUpdate = useCallback(
    (newDoc: string) => setInitialState(newDoc, scope),
    [setInitialState, scope],
  );

  const initialValueErrors = useMemo(() => {
    const existingValue = initialValue || "{}";
    const sharedSchemaDocumentNode = safeParseSdl(sharedSchemaSdl);
    if (!sharedSchemaDocumentNode) return [];
    const stateTypeName = makeStateSchemaNameForScope(modelName, scope);
    if (!stateTypeName) return [];
    const stateTypeDefinitionNode = sharedSchemaDocumentNode.definitions.find(
      (def) =>
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        def.name.value === stateTypeName,
    );
    if (
      !stateTypeDefinitionNode ||
      stateTypeDefinitionNode.kind !== Kind.OBJECT_TYPE_DEFINITION
    )
      return [];

    const errors = validateStateObject(
      sharedSchemaDocumentNode,
      stateTypeDefinitionNode,
      existingValue,
    );

    if (errors.length && syncWithSchema) {
      const fixedState = makeMinimalObjectForStateType({
        sharedSchemaDocumentNode,
        stateTypeDefinitionNode,
        existingValue,
      });
      if (initialValue !== fixedState) {
        setInitialState(fixedState, scope);
        return [];
      }
    }
    return errors;
  }, [sharedSchemaSdl, initialValue, syncWithSchema, scope]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3 className="mb-2 text-lg capitalize">{scope} state schema *</h3>
        <Button
          onClick={handleToggleStandardLib}
          className="mb-2 flex w-fit items-center gap-2"
        >
          {showStandardLib ? "Hide" : "Show"} standard library
          <svg
            className={cn(
              "inline-block transition-transform",
              showStandardLib ? "rotate-180" : "rotate-0",
            )}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
          >
            <path
              d="M11.9883 6.01172C11.4363 6.01172 10.9883 6.45972 10.9883 7.01172V13.0117H6.98828L11.9883 18.0117L16.9883 13.0117H12.9883V7.01172C12.9883 6.45972 12.5403 6.01172 11.9883 6.01172Z"
              fill="black"
            />
          </svg>
        </Button>
        <Suspense>
          {showStandardLib && <GraphqlEditor doc={typeDefsDoc} readonly />}
          <GraphqlEditor
            doc={stateSchema}
            updateDocumentInModel={handleSchemaUpdate}
            customLinter={customLinter}
          />
          {schemaErrors.length > 0 && (
            <p className="mt-2 text-sm text-red-600">
              {schemaErrors[0].message}
            </p>
          )}
        </Suspense>
      </div>
      <div>
        <div className="flex flex-col items-end">
          <h3 className="mb-2 text-right text-lg capitalize">
            {scope} state initial value *
          </h3>
          <Checkbox
            value={syncWithSchema}
            onChange={setSyncWithSchema}
            className="mb-2 w-fit whitespace-nowrap rounded-md border border-gray-200 bg-gray-50 pl-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            label={
              <div className="flex items-center gap-2 py-2 pr-2">
                Sync with schema{" "}
                <svg
                  className="inline-block"
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M8.00521 1.99219C6.63588 1.99219 5.32788 2.45152 4.27588 3.28419C3.98721 3.51219 3.94321 3.93285 4.17188 4.22151C4.40054 4.51018 4.82055 4.55418 5.10921 4.32552C5.92721 3.67819 6.93921 3.32552 8.00521 3.32552C10.5825 3.32552 12.6719 5.41485 12.6719 7.99218H11.3385L13.3385 10.6588L15.3385 7.99218H14.0052C14.0052 4.67818 11.3192 1.99219 8.00521 1.99219ZM2.67188 5.32552L0.671875 7.99218H2.00521C2.00521 11.3062 4.69121 13.9922 8.00521 13.9922C9.37521 13.9922 10.6825 13.5335 11.7345 12.7002C12.0232 12.4722 12.0672 12.0515 11.8385 11.7628C11.6099 11.4742 11.1899 11.4302 10.9012 11.6588C10.0825 12.3068 9.07188 12.6588 8.00521 12.6588C5.42788 12.6588 3.33854 10.5695 3.33854 7.99218H4.67188L2.67188 5.32552Z"
                    fill="#343839"
                  />
                </svg>
              </div>
            }
          />
        </div>
        <Suspense>
          <JSONEditor
            doc={initialValue}
            updateDocumentInModel={handleInitialStateUpdate}
          />
          {initialValueErrors.map((error, index) => (
            <p key={index} className="mt-2 text-sm text-red-600">
              {error instanceof StateValidationError ? (
                <StateValidationErrorMessage error={error} />
              ) : (
                error.message
              )}
            </p>
          ))}
        </Suspense>
      </div>
    </div>
  );
}

export default function StateSchemas({
  modelName,
  globalStateSchema,
  localStateSchema,
  globalStateInitialValue,
  localStateInitialValue,
  setStateSchema,
  setInitialState,
  currentScope,
  onScopeChange,
}: Props) {
  const handleAddLocalState = useCallback(() => {
    const initialDoc = makeInitialSchemaDoc(modelName, "local");
    setStateSchema(initialDoc, "local");
    setInitialState("", "local");
  }, [modelName, setStateSchema, setInitialState]);

  return (
    <Tabs
      className="pb-8"
      activationMode="manual"
      value={currentScope}
      onValueChange={(value) => onScopeChange(value as Scope)}
    >
      <div className="my-6">
        <TabsList className="mx-auto flex max-w-sm">
          <TabsTrigger value="global">Global</TabsTrigger>
          <TabsTrigger value="local">Local</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="global" tabIndex={-1}>
        <StateEditor
          modelName={modelName}
          stateSchema={globalStateSchema}
          initialValue={globalStateInitialValue}
          setStateSchema={setStateSchema}
          setInitialState={setInitialState}
          scope="global"
        />
      </TabsContent>

      <TabsContent value="local" tabIndex={-1}>
        {!localStateSchema ? (
          <div className="">
            <h3 className="mb-2 text-lg capitalize">local state schema *</h3>
            <Button onClick={handleAddLocalState}>Add local state</Button>
          </div>
        ) : (
          <StateEditor
            modelName={modelName}
            stateSchema={localStateSchema}
            initialValue={localStateInitialValue}
            setStateSchema={setStateSchema}
            setInitialState={setInitialState}
            scope="local"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
