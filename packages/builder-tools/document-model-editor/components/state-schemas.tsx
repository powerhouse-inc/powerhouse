import { useCallback, useState } from "react";
import { typeDefsDoc } from "../constants/documents.js";
import { useSchemaContext } from "../context/schema-context.js";
import { type Scope } from "../types/documents.js";
import {
  makeInitialSchemaDoc,
  makeMinimalObjectFromSDL,
} from "../utils/helpers.js";
import { ensureValidStateSchemaName } from "../utils/linting.js";
import { cn } from "../utils/style.js";
import { Button } from "./button.js";
import { GraphqlEditor } from "./code-editors/graphql-editor.js";
import { JSONEditor } from "./code-editors/json-editor.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs.js";

type Props = {
  modelName: string;
  globalStateSchema: string;
  localStateSchema: string;
  globalStateInitialValue: string;
  localStateInitialValue: string;
  setStateSchema: (doc: string, scope: Scope) => void;
  setInitialState: (doc: string, scope: Scope) => void;
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
  const sharedSchemaSdl = useSchemaContext();
  const [showStandardLib, setShowStandardLib] = useState(false);

  const customLinter = useCallback(
    (doc: string) => ensureValidStateSchemaName(doc, modelName, scope),
    [modelName, scope],
  );

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

  const handleSyncWithSchema = useCallback(() => {
    const updatedStateDoc = makeMinimalObjectFromSDL(
      sharedSchemaSdl,
      stateSchema,
      initialValue ? JSON.parse(initialValue) : {},
    );
    setInitialState(updatedStateDoc, scope);
  }, [sharedSchemaSdl, stateSchema, initialValue, setInitialState, scope]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <h3 className="mb-2 text-lg capitalize">{scope} state schema</h3>
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
        {showStandardLib && <GraphqlEditor doc={typeDefsDoc} readonly />}
        <GraphqlEditor
          doc={stateSchema}
          updateDocumentInModel={handleSchemaUpdate}
          customLinter={customLinter}
        />
      </div>
      <div>
        <div className="flex flex-col items-end">
          <h3 className="mb-2 text-right text-lg capitalize">
            {scope} state initial value
          </h3>
          <Button
            onClick={handleSyncWithSchema}
            className="mb-2 flex w-fit items-center gap-2"
          >
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
          </Button>
        </div>
        <JSONEditor
          doc={initialValue}
          updateDocumentInModel={handleInitialStateUpdate}
        />
      </div>
    </div>
  );
}

export function StateSchemas({
  modelName,
  globalStateSchema,
  localStateSchema,
  globalStateInitialValue,
  localStateInitialValue,
  setStateSchema,
  setInitialState,
}: Props) {
  const handleAddLocalState = useCallback(() => {
    const initialDoc = makeInitialSchemaDoc(modelName, "local");
    setStateSchema(initialDoc, "local");
    setInitialState("", "local");
  }, [modelName, setStateSchema, setInitialState]);

  return (
    <Tabs className="pb-8" activationMode="manual" defaultValue="global">
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
            <h3 className="mb-2 text-lg capitalize">local state schema</h3>
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
