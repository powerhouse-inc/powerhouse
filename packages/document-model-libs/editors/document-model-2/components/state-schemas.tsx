import { typeDefs } from "@powerhousedao/scalars";
import { makeMinimalObjectFromSDL, makeInitialSchemaDoc } from "../utils";
import { GraphqlEditor } from "./graphql-editor";
import { JSONEditor } from "./json-editor";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";
import { DocumentActionHandlers } from "../types";
import { useState } from "react";
import { GraphQLSchema } from "graphql";
import { capitalCase } from "change-case";

type Props = {
  modelName: string;
  schema: GraphQLSchema;
  globalStateSchema: string;
  globalStateInitialValue: string;
  localStateSchema: string;
  localStateInitialValue: string;
  handlers: DocumentActionHandlers;
};

type StateEditorProps = {
  schema: GraphQLSchema;
  stateSchema: string;
  initialValue: string;
  handlers: DocumentActionHandlers;
  scope: "global" | "local";
};

function StateEditor({
  schema,
  stateSchema,
  initialValue,
  handlers,
  scope,
}: StateEditorProps) {
  const [showStandardLib, setShowStandardLib] = useState(false);

  return (
    <>
      <h2 className="mb-4 text-lg">{capitalCase(scope)} State Schema</h2>
      <div className="grid grid-cols-2 gap-2">
        <div>
          {showStandardLib && (
            <GraphqlEditor
              doc={typeDefs.join("\n")}
              schema={schema}
              readonly
              updateDoc={() => {}}
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
              schema={schema}
              updateDoc={(newDoc) => handlers.setStateSchema(newDoc, scope)}
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
                  schema,
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
              schema={schema}
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
    schema,
    modelName,
    globalStateSchema,
    localStateSchema,
    handlers,
    globalStateInitialValue,
    localStateInitialValue,
  } = props;

  return (
    <Tabs defaultValue="global" className="pb-8">
      <div className="mb-10 mt-8 grid grid-cols-3 items-center">
        <div className="h-1 bg-gray-900"></div>
        <TabsList className="flex" tabIndex={-1}>
          <TabsTrigger value="global">Global</TabsTrigger>
          <TabsTrigger value="local">Local</TabsTrigger>
        </TabsList>
        <div className="h-1 bg-gray-900"></div>
      </div>

      <TabsContent value="global" tabIndex={-1}>
        <StateEditor
          schema={schema}
          stateSchema={globalStateSchema}
          initialValue={globalStateInitialValue}
          handlers={handlers}
          scope="global"
        />
      </TabsContent>

      <TabsContent value="local">
        {!localStateSchema ? (
          <div className="grid w-full place-items-center pb-8">
            <button
              className="mt-2 rounded border border-slate-800 bg-white px-2 py-1 text-slate-800"
              onClick={() => {
                const initialDoc = makeInitialSchemaDoc(modelName, "local");
                handlers.setStateSchema(initialDoc, "local");
                handlers.setInitialState("", "local");
              }}
            >
              Add local state
            </button>
          </div>
        ) : (
          <div>
            <StateEditor
              schema={schema}
              stateSchema={localStateSchema}
              initialValue={localStateInitialValue}
              handlers={handlers}
              scope="local"
            />
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
