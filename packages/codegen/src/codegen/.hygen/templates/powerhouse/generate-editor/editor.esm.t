---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/editor.tsx"
unless_exists: true
---
<% if(!documentTypes.length){ %>import type { EditorProps, PHDocument } from 'document-model';<% } else { %>import type { EditorProps } from 'document-model';<% } %>
import { actions as baseActions } from "document-model";
<% documentTypes.forEach(type => { _%>
import { type <%= documentTypesMap[type].name %>Document, actions } from "<%= documentTypesMap[type].importPath %>";
%><% }); _%>
import {
  Button,
  Form,
  FormLabel,
  StringField,
} from "@powerhousedao/document-engineering";

export type EditorDocument = <% if(documentTypes.length) { %><% documentTypes.map(type => { _%><%= documentTypesMap[type].name %>Document<% }).join(" | ") %><% } else { %>PHDocument<% } %>;
export type IProps = EditorProps<EditorDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  function handleSetName(values: { name: string }) {
    if (values.name) {
      dispatch(baseActions.setName(values.name));
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
              resetOnSuccessfulSubmit
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