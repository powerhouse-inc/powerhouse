---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
import {
  Button,
  Form,
  FormLabel,
  StringField,
} from "@powerhousedao/document-engineering";
<% if(!documentType){ %>import { useSelectedDocument } from "@powerhousedao/reactor-browser";<% } else { %>import { useSelected<%= documentType.name %>Document %>} from "../hooks/use<%= documentType.name %>Document%>.js";<% } %>
import { setName } from "document-model";<% if(documentType?.modules.length) { %>
import {
<% documentType.modules.filter(module => module.actions.length).forEach(module => { _%>
  // <%= module.name || module.id %>
<% module.actions.forEach(action => { _%>
  <%= h.changeCase.camel(action.name) %>,
<% });%><% });%>} from "<%= documentType.importPath %>/gen/creators.js";<% } %>

export function Editor() {
  const [document, dispatch] = <% if(documentType) { %>useSelected<%= documentType.name %>Document()<% } else { %>useSelectedDocument()<% } %>;
<% if(!documentType){ %>
  if (!document) {
    return null;
  }
<% } %>
  function handleSetName(values: { name: string }) {
    if (values.name) {
      dispatch(setName(values.name));
    }
  }

  return (
    <div className="ph-default-styles py-10 text-center">
      <div className="inline-flex flex-col gap-10 text-start">
        
        {/* Edit document name form */}
        <section className="flex justify-between">
          <h1 className="text-start">{document.header.name}</h1>
          <div className="flex flex-col space-y-2">
            <Form
              onSubmit={handleSetName}
              defaultValues={{ name: document.header.name }}
              className="flex flex-col gap-3 pt-2"
            >
              <div className="flex items-end gap-3">
                <div>
                  <FormLabel htmlFor="name">
                    <b className="mb-1">Change document name</b>
                  </FormLabel>
                  <StringField
                    name="name"
                    placeholder="Enter document name"
                    className="mt-1"
                  />
                </div>
                <Button type="submit">Edit</Button>
              </div>
            </Form>
          </div>
        </section>

        {/* Document metadata */}
        <section>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-700">
            <li>
              <b className="mr-1">Id:</b>
              {document.header.id}
            </li>
            <li>
              <b className="mr-1">Created:</b>
              {new Date(document.header.createdAtUtcIso).toLocaleString()}
            </li>
            <li>
              <b className="mr-1">Type:</b>
              {document.header.documentType}
            </li>
            <li>
              <b className="mr-1">Last Modified:</b>
              {new Date(document.header.lastModifiedAtUtcIso).toLocaleString()}
            </li>
          </ul>
        </section>

        {/* Document state */}
        <section className="inline-block">
          <h2 className="mb-4">Document state</h2>
          <textarea
            rows={10}
            readOnly
            value={JSON.stringify(document.state, null, 2)}
            className="font-mono"
          ></textarea>
        </section>
      </div>
    </div>
  );
}