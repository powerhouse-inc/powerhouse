import { Button } from "@powerhousedao/design-system";
import { Module } from "../components/module";
import { useState } from "react";
import {
  STATE_DOC_ID,
  LOCAL_STATE_DOC_ID,
  STANDARD_LIB_DOC_ID,
} from "../constants/documents";
import { removeLocalStateEditor, addLocalStateEditor } from "../lib/editors";
import { AddTypeForm } from "./form/add-type-form";
import { ModuleForm } from "./form/module-form";
import { GraphqlEditor } from "./graphql-editor";
import { useFormManager } from "../context/FormManager";
import { useSchema } from "../context/SchemaContext";
import { useDocumentModel } from "../context/DocumentModelContext";
import { docStore } from "../store/docStore";
import { generateMinimalObject } from "../lib";
export default function DocumentModelEditor() {
  const { document, handlers } = useDocumentModel();
  const { schema, modules, globalStateDoc, localStateDoc, hasLocalState } =
    useSchema();
  const { activeForm, showForm } = useFormManager();
  const [showStandardLib, setShowStandardLib] = useState(false);

  function saveChanges() {
    const globalStateSchema =
      document?.state.global.specifications[0].state.global.schema;

    if (globalStateDoc !== globalStateSchema) {
      handlers.setStateSchema(globalStateDoc, "global");
      const initialValue = JSON.stringify(
        generateMinimalObject(schema, "State"),
      );
      handlers.setInitialState(initialValue, "global");
    }
    if (localStateDoc) {
      const localStateSchema =
        document?.state.global.specifications[0].state.local.schema;
      if (localStateSchema !== localStateDoc) {
        handlers.setStateSchema(localStateDoc, "local");
        const initialValue = JSON.stringify(
          generateMinimalObject(schema, "LocalState"),
        );
        handlers.setInitialState(initialValue, "local");
      }
    }
    for (const module of modules) {
      for (const operation of module.operations) {
        const operationDoc = docStore.state.get(operation.name!)!;
        if (operation.schema! !== operationDoc) {
          handlers.updateOperationSchema(operation.id, operationDoc);
        }
      }
    }
  }

  return (
    <main className="mx-auto min-h-dvh max-w-screen-xl px-4 pt-8">
      <div className="mt-2 flex gap-2">
        <Button onClick={() => showForm("type")}>Add type</Button>
        <Button onClick={() => showForm("module")}>Add module</Button>
        {hasLocalState ? (
          <Button onClick={() => removeLocalStateEditor()}>
            Remove Local State
          </Button>
        ) : (
          <Button onClick={() => addLocalStateEditor()}>Add Local State</Button>
        )}
        {showStandardLib ? (
          <Button onClick={() => setShowStandardLib(false)}>
            Hide Standard Library
          </Button>
        ) : (
          <Button onClick={() => setShowStandardLib(true)}>
            Show Standard Library
          </Button>
        )}
        <Button onClick={saveChanges}>Save Changes</Button>
      </div>
      <div>
        {showStandardLib && (
          <GraphqlEditor id={STANDARD_LIB_DOC_ID} schema={schema} readonly />
        )}
        <GraphqlEditor id={STATE_DOC_ID} schema={schema} />
        {hasLocalState && (
          <GraphqlEditor id={LOCAL_STATE_DOC_ID} schema={schema} />
        )}
        {modules.map((module) => (
          <div className="my-4" key={module.id}>
            <Module module={module} />
          </div>
        ))}
      </div>
      {activeForm === "type" && <AddTypeForm />}
      {activeForm === "module" && <ModuleForm />}
    </main>
  );
}
