import type {
  DocumentModelPHState,
  DocumentModelSpecificationDefinition,
  DocumentSpecification,
} from "@powerhousedao/shared/document-model";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { NormalizedDocumentModelArtifact } from "../../src/definition/adapters/types.js";
import { canonicalJson } from "../../src/definition/primitives.js";
import { printSchemaSegment } from "../../src/definition/printer.js";
import { assignStoredSegments } from "../../src/definition/segments.js";

/**
 * What a parity golden is, and how it is produced.
 *
 * A golden is bytes. The oracle is the canonical JSON of the parsed value, so
 * a golden never depends on how a source file happened to be formatted, and
 * every embedded string — state SDL, operation SDL, initial JSON, template,
 * reducer, description — is compared exactly, character for character.
 */

export const GOLDEN_DIRECTORY = fileURLToPath(
  new URL("goldens/", import.meta.url),
);

export function goldenPath(name: string): string {
  return `${GOLDEN_DIRECTORY}${name}`;
}

export function readGolden(name: string): string {
  return readFileSync(goldenPath(name), "utf8");
}

/** The golden documents one root produces, as bytes. */
export function goldenContents(
  artifact: NormalizedDocumentModelArtifact,
): ReadonlyMap<string, string> {
  const contents = new Map<string, string>();
  contents.set("definition.json", `${canonicalJson(artifact.definition)}\n`);
  contents.set("state.json", `${canonicalJson(artifact.documentModel)}\n`);
  contents.set("identity.json", `${canonicalJson(artifact.identity)}\n`);
  for (const specification of artifact.documentModel.global.specifications) {
    contents.set(
      `v${specification.version}.graphql`,
      assembleStoredSchema(specification),
    );
  }
  for (const specification of artifact.definition.specifications) {
    contents.set(
      `v${specification.version}.canonical.graphql`,
      printCanonicalSchema(specification),
    );
  }
  return contents;
}

/**
 * What the printer produces from the structured types, segment by segment.
 *
 * Every stored segment in the corpus is a retained serialization override —
 * the models are hand-formatted — so comparing the stored SDL to a golden
 * built from those same strings would prove nothing about the printer. This
 * golden is the printer's own output, so a one-character change in it fails
 * every root.
 */
export function printCanonicalSchema(
  specification: DocumentModelSpecificationDefinition,
): string {
  const operations = specification.modules.flatMap((module) =>
    module.operations.map((operation) => ({
      key: `${module.key}/${operation.key}`,
      input: operation.input,
    })),
  );
  const segments = assignStoredSegments({
    types: specification.types,
    globalRoot: specification.state.global.root.name,
    localRoot: specification.state.local.root?.name ?? null,
    operations,
  });
  const parts = [
    printSchemaSegment(segments.global),
    printSchemaSegment(segments.local),
    ...operations.map((operation) =>
      printSchemaSegment(
        segments.operations.get(operation.key) ??
          (operation.input === null ? [] : [operation.input]),
      ),
    ),
  ];
  return `${parts.filter((part) => part !== "").join("\n")}`;
}

/**
 * The stored SDL of one specification, assembled the way the schema-first
 * pipeline assembles it: the state segments, then each module's comment and
 * its operation segments, in stored order
 * (`codegen/src/codegen/graphql.ts` `buildGraphqlDocumentStringForSpecification`).
 *
 * Codegen's scalar prelude is left out on purpose: it is a constant of that
 * package, not data this model carries, and the SDL printer keeps a stored
 * segment free of declarations it does not own. The parity suite prepends the
 * catalog declarations separately when it builds the document, which is what
 * proves the assembly is a usable schema.
 */
export function assembleStoredSchema(
  specification: DocumentSpecification,
): string {
  const segments: string[] = [
    specification.state.global.schema,
    specification.state.local.schema,
  ];
  for (const module of specification.modules) {
    segments.push(`# ${module.name}`);
    for (const operation of module.operations) {
      if (operation.schema !== null) segments.push(operation.schema);
    }
  }
  return `${segments.filter((segment) => segment.trim() !== "").join("\n\n")}\n`;
}

/** Every stored string a specification carries, for exact comparison. */
export function storedStrings(
  state: DocumentModelPHState,
): readonly (readonly [string, string])[] {
  const entries: (readonly [string, string])[] = [];
  state.global.specifications.forEach((specification, index) => {
    const at = `specifications/${index}`;
    for (const scope of ["global", "local"] as const) {
      entries.push([
        `${at}/state/${scope}/schema`,
        specification.state[scope].schema,
      ]);
      entries.push([
        `${at}/state/${scope}/initialValue`,
        specification.state[scope].initialValue,
      ]);
      specification.state[scope].examples.forEach((example, exampleIndex) => {
        entries.push([
          `${at}/state/${scope}/examples/${exampleIndex}`,
          example.value,
        ]);
      });
    }
    specification.modules.forEach((module, moduleIndex) => {
      const modulePath = `${at}/modules/${moduleIndex}`;
      entries.push([`${modulePath}/name`, module.name]);
      entries.push([`${modulePath}/description`, String(module.description)]);
      module.operations.forEach((operation, operationIndex) => {
        const operationPath = `${modulePath}/operations/${operationIndex}`;
        entries.push([`${operationPath}/name`, String(operation.name)]);
        entries.push([
          `${operationPath}/description`,
          String(operation.description),
        ]);
        entries.push([`${operationPath}/schema`, String(operation.schema)]);
        entries.push([`${operationPath}/template`, String(operation.template)]);
        entries.push([`${operationPath}/reducer`, String(operation.reducer)]);
        operation.errors.forEach((error, errorIndex) => {
          const errorPath = `${operationPath}/errors/${errorIndex}`;
          entries.push([`${errorPath}/code`, String(error.code)]);
          entries.push([`${errorPath}/name`, String(error.name)]);
          entries.push([`${errorPath}/description`, String(error.description)]);
          entries.push([`${errorPath}/template`, String(error.template)]);
        });
        operation.examples.forEach((example, exampleIndex) => {
          entries.push([
            `${operationPath}/examples/${exampleIndex}`,
            example.value,
          ]);
        });
      });
    });
  });
  return entries;
}
