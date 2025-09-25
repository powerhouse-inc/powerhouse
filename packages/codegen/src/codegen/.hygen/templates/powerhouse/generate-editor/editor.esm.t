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
  FormGroup,
  StringField,
} from "@powerhousedao/document-engineering";

export type EditorDocument = <% if(documentTypes.length) { %><% documentTypes.map(type => { _%><%= documentTypesMap[type].name %>Document<% }).join(" | ") %><% } else { %>PHDocument<% } %>;
export type IProps = EditorProps<EditorDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  function handleSetName(values: { documentName: string }) {
    dispatch(baseActions.setName(values.documentName));
  }

  return (
    <div className="ph-default-styles text-center">
      <div className="mx-auto inline-flex flex-col gap-10 py-10 text-start">
        <div>
          <h3 className="mb-2">Document Information</h3>
          <div className="inline-flex items-center gap-6">
            <div className="rounded border border-zinc-200 bg-slate-50 p-4">
              <div>
                <b>Id:</b> {document.header.id}
              </div>
              <div>
                <b>Name:</b> {document.header.name}
              </div>
              <div>
                <b>Created:</b>{" "}
                {new Date(document.header.createdAtUtcIso).toLocaleString()}
              </div>
              <div>
                <b>Last Modified:</b>{" "}
                {new Date(
                  document.header.lastModifiedAtUtcIso,
                ).toLocaleString()}
              </div>
              <div>
                <b>Type:</b> {document.header.documentType}
              </div>
            </div>
            <Form
              onSubmit={handleSetName}
              defaultValues={{ documentName: document.header.name }}
              className="flex max-w-sm items-end gap-2"
            >
              <FormGroup>
                <StringField
                  name="documentName"
                  label="Edit Document Name:"
                  className="mb-1"
                />
                <Button type="submit">Submit</Button>
              </FormGroup>
            </Form>
          </div>
        </div>
        <div>
          <h3 className="mb-2">Document state</h3>
          <pre className="overflow-auto rounded-lg border border-zinc-200 bg-slate-50 p-4 font-mono text-sm">
            {JSON.stringify(document.state, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}