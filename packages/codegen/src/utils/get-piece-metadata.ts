import path from "path";
import {
  SyntaxKind,
  type ObjectLiteralExpression,
  type Project,
} from "ts-morph";
import { getOrCreateDirectory } from "utils";

export type PieceListEntry = {
  name: string;
  version: string;
  entry?: string;
  bundle?: string;
};

export type PieceMetadata = {
  dirName: string;
  displayName?: string;
  description?: string;
  /** Whether the piece declares an auth property, so its parts need one too. */
  hasAuth: boolean;
};

export const PIECES_DIR = "pieces";

// The path a list entry must name for `ph build` to find the built piece.
export function pieceEntryPath(dirName: string): string {
  return `dist/node/pieces/${dirName}/index.mjs`;
}

// The piece directory a list entry points into, from the only two shapes the
// build resolves: dist/node/pieces/<dir>/index.mjs, or that directory itself.
export function pieceDirNameOf(entry: PieceListEntry): string | undefined {
  const declared = entry.entry ?? entry.bundle;
  if (!declared) return undefined;
  const parts = declared.split("/").filter(Boolean);
  const index = parts.lastIndexOf("pieces");
  if (index === -1 || parts.length <= index + 1) return undefined;
  return parts[index + 1];
}

function stringProperty(
  literal: ObjectLiteralExpression,
  name: string,
): string | undefined {
  return literal
    .getProperty(name)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializerIfKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}

export function getPiecesListSourceFile(project: Project) {
  const { directory } = getOrCreateDirectory(project, PIECES_DIR);
  const filePath = path.join(directory.getPath(), "index.ts");
  return (
    project.getSourceFile(filePath) ??
    project.addSourceFileAtPathIfExists(filePath)
  );
}

/** The entries of pieces/index.ts, read from the `pieces` array literal. */
export function readPiecesList(project: Project): PieceListEntry[] {
  const sourceFile = getPiecesListSourceFile(project);
  if (!sourceFile) return [];
  const array = sourceFile
    .getVariableDeclaration("pieces")
    ?.getDescendantsOfKind(SyntaxKind.ArrayLiteralExpression)
    .at(0);
  if (!array) return [];
  return array
    .getElements()
    .map((element) => element.asKind(SyntaxKind.ObjectLiteralExpression))
    .filter((literal) => literal !== undefined)
    .map((literal) => ({
      name: stringProperty(literal, "name") ?? "",
      version: stringProperty(literal, "version") ?? "",
      entry: stringProperty(literal, "entry"),
      bundle: stringProperty(literal, "bundle"),
    }))
    .filter((entry) => entry.name !== "");
}

// A piece's own `createPiece({...})` call, which is where its display name and
// whether it asks for a connection are written.
function getCreatePieceArgument(project: Project, dirName: string) {
  const { directory } = getOrCreateDirectory(
    project,
    path.join(PIECES_DIR, dirName),
  );
  const filePath = path.join(directory.getPath(), "index.ts");
  const sourceFile =
    project.getSourceFile(filePath) ??
    project.addSourceFileAtPathIfExists(filePath);
  return sourceFile
    ?.getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((call) => call.getExpression().getText() === "createPiece")
    ?.getArguments()
    .at(0)
    ?.asKind(SyntaxKind.ObjectLiteralExpression);
}

/** What pieces/<dirName>/index.ts says about itself. */
export function getPieceMetadata(
  project: Project,
  dirName: string,
): PieceMetadata {
  const literal = getCreatePieceArgument(project, dirName);
  const auth = literal
    ?.getProperty("auth")
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getInitializer()
    ?.getText();
  return {
    dirName,
    displayName: literal ? stringProperty(literal, "displayName") : undefined,
    description: literal ? stringProperty(literal, "description") : undefined,
    hasAuth: auth !== undefined && auth !== "undefined",
  };
}
