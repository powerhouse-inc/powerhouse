import { makeMinimalObjectFromSDL, makeInitialSchemaDoc } from "../utils";
import { GraphqlEditor } from "./graphql-editor";
import { JSONEditor } from "./json-editor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import { DocumentActionHandlers } from "../types";
import { useState } from "react";
import { capitalCase } from "change-case";
import { useSchemaContext } from "../context/schema-context";
import { hiddenQueryTypeDefDoc } from "../constants";

type Props = {
  modelName: string;
  globalStateSchema: string;
  localStateSchema: string;
  globalStateInitialValue: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
};

type StateEditorProps = {
  stateSchema: string;
  initialValue: string;
  handlers: DocumentActionHandlers;
  scope: "global" | "local";
};

function StateEditor({
  stateSchema,
  initialValue,
  handlers,
  scope,
}: StateEditorProps) {
  const { sharedSchema } = useSchemaContext();
  const [showStandardLib, setShowStandardLib] = useState(false);

  return (
    <>
      <h2 className="mb-4 text-lg">{capitalCase(scope)} State Schema</h2>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {showStandardLib && (
            <GraphqlEditor
              doc={hiddenQueryTypeDefDoc}
              id="standard-lib"
              readonly
              updateDocumentInModel={() => {}}
            />
          )}
          <button
            className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
            onClick={() => setShowStandardLib(!showStandardLib)}
          >
            {showStandardLib ? "Hide" : "Show"} standard library
          </button>
          <div className="pt-2">
            <GraphqlEditor
              doc={stateSchema}
              id={scope}
              updateDocumentInModel={(newDoc) =>
                handlers.setStateSchema(newDoc, scope)
              }
            />
          </div>
        </div>
        <div>
          <div className="flex h-8 items-end justify-between">
            <h3>Initial State</h3>
            <button
              className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
              onClick={() => {
                const updatedStateDoc = makeMinimalObjectFromSDL(
                  sharedSchema,
                  stateSchema,
                  initialValue ? JSON.parse(initialValue) : {},
                );
                handlers.setInitialState(updatedStateDoc, scope);
              }}
            >
              Sync with schema
            </button>
          </div>
          <div className="pt-2">
            <JSONEditor
              doc={initialValue}
              updateDoc={(newDoc) => handlers.setInitialState(newDoc, scope)}
            />
          </div>
        </div>
      </div>
    </>
  );
}

export function StateSchemas(props: Props) {
  const {
    modelName,
    globalStateSchema,
    localStateSchema,
    handlers,
    globalStateInitialValue,
    localStateInitialValue,
  } = props;

  return (
    <Tabs className="pb-8" activationMode="manual" defaultValue="global">
      <div className="mb-10 mt-8">
        <TabsList className="mx-auto flex max-w-sm">
          <TabsTrigger value="global">Global</TabsTrigger>
          <TabsTrigger value="local">Local</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="global" tabIndex={-1}>
        <StateEditor
          stateSchema={globalStateSchema}
          initialValue={globalStateInitialValue}
          handlers={handlers}
          scope="global"
        />
      </TabsContent>

      <TabsContent
        value="local"
        className="grid w-full place-items-center pb-8"
        tabIndex={-1}
      >
        {!localStateSchema ? (
          <button
            className="rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
            onClick={() => {
              const initialDoc = makeInitialSchemaDoc(modelName, "local");
              handlers.setStateSchema(initialDoc, "local");
              handlers.setInitialState("", "local");
            }}
          >
            Add local state
          </button>
        ) : (
          <StateEditor
            stateSchema={localStateSchema}
            initialValue={localStateInitialValue}
            handlers={handlers}
            scope="local"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
