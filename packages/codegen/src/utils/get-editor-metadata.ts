import { join } from "path";
import {
  filter,
  find,
  isDefined,
  isIncludedIn,
  isString,
  isTruthy,
  map,
  merge,
  pipe,
  when,
} from "remeda";
import { SyntaxKind, type Project } from "ts-morph";
import { getOrCreateDirectory } from "utils";
import { z } from "zod";

const EditorMetadataSchema = z.object({
  name: z.string(),
  id: z.string(),
  dirName: z.string(),
  documentTypes: z.array(z.string()),
});

export function getEditorMetadata(project: Project, dirName: string) {
  const { directory: editorDir } = getOrCreateDirectory(
    project,
    join("editors", dirName),
  );
  const parsedMetadata = pipe(
    editorDir,
    (dir) => dir.getSourceFile("module.ts"),
    when(
      (sourceFile) => isTruthy(sourceFile),
      (sourceFile) => ({
        sourceFile,
        propertyAssignments: sourceFile.getDescendantsOfKind(
          SyntaxKind.PropertyAssignment,
        ),
      }),
    ),
    when(
      (data) => isTruthy(data),
      ({ sourceFile, propertyAssignments }) => ({
        dirName: sourceFile.getDirectory().getBaseName(),
        id: find(
          propertyAssignments,
          (propertyAssignment) => propertyAssignment.getName() === "id",
        )
          ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
          ?.getLiteralValue(),
        name: find(
          propertyAssignments,
          (propertyAssignment) => propertyAssignment.getName() === "name",
        )
          ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
          ?.getLiteralValue(),
        documentTypes: pipe(
          find(
            propertyAssignments,
            (propertyAssignment) =>
              propertyAssignment.getName() === "documentTypes",
          )
            ?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
            ?.getElements() ?? [],
          map((element) =>
            element.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
          ),
          filter(isString),
        ),
      }),
    ),
    (data) => EditorMetadataSchema.safeParse(data),
  );

  if (parsedMetadata.success) return parsedMetadata.data;
  return undefined;
}

export function getAppMetadata(project: Project, dirName: string) {
  const editorMetadata = getEditorMetadata(project, dirName);
  if (
    !editorMetadata ||
    isIncludedIn("powerhouse/document-drive", editorMetadata.documentTypes)
  )
    return undefined;

  const appMetadata = pipe(
    project
      .getSourceFile(join("editors", dirName, "config.ts"))
      ?.getDescendantsOfKind(SyntaxKind.PropertyAssignment) ?? [],
    (propertyAssignments) => ({
      isDragAndDropEnabled: pipe(
        find(
          propertyAssignments,
          (propertyAssignment) =>
            propertyAssignment.getName() === "isDragAndDropEnabled",
        )?.getDescendants() ?? [],
        when(
          (descendants) =>
            isDefined(
              find(descendants, (d) => d.getKind() === SyntaxKind.TrueKeyword),
            ),
          {
            onTrue: () => true,
            onFalse: () => false,
          },
        ),
      ),
      allowedDocumentTypes: pipe(
        find(
          propertyAssignments,
          (propertyAssignment) =>
            propertyAssignment.getName() === "allowedDocumentTypes",
        )
          ?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
          ?.getElements() ?? [],
        map((element) =>
          element.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
        ),
        filter(isString),
      ),
    }),
  );
  return merge(editorMetadata, appMetadata);
}
