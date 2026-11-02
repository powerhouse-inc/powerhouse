import { generateDocumentModel } from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type {
  DocumentModelGlobalState,
  OperationErrorSpecification,
} from "@powerhousedao/shared/document-model";
import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOCUMENT_MODELS, NEW_PROJECT, TEST_OUTPUT } from "../constants.js";
import { cpForce, rmForce, runTsc } from "../utils.js";

const outDir = join(TEST_OUTPUT, "generate-error-codes");
const errorFile = join(
  outDir,
  "document-models/test-doc/v1/gen/base-operations/error.ts",
);

function error(
  fields: Partial<OperationErrorSpecification> & { name: string },
): OperationErrorSpecification {
  return {
    id: fields.name,
    code: "",
    description: "",
    template: "",
    ...fields,
  };
}

// test-doc's spec, with these errors on its two operations.
function specWithErrors(
  setTestId: OperationErrorSpecification[],
  setTestName: OperationErrorSpecification[],
) {
  const spec = JSON.parse(
    readFileSync(join(DOCUMENT_MODELS, "test-doc", "test-doc.json"), "utf8"),
  ) as DocumentModelGlobalState;
  const [operations] = spec.specifications[0].modules.map((m) => m.operations);
  operations[0].errors = setTestId;
  operations[1].errors = setTestName;
  return spec;
}

async function generate(spec: DocumentModelGlobalState) {
  await rmForce(outDir);
  await cpForce(NEW_PROJECT, outDir);
  const project = buildTsMorphProject(outDir);
  await generateDocumentModel(spec, project);
  await project.save();
}

const warn = spyOn(console, "warn");
afterEach(() => warn.mockClear());

describe("operation error codes", () => {
  it("are the model's codes, or the error name when a code is empty", async () => {
    await generate(
      specWithErrors(
        [error({ name: "DuplicateTitleError", code: "DUPLICATE_TITLE" })],
        [error({ name: "EmptyNameError" })],
      ),
    );

    const errors = readFileSync(errorFile, "utf8");
    expect(errors).toContain(
      'export type ErrorCode = "DUPLICATE_TITLE" | "EmptyNameError";',
    );
    expect(errors).toContain('errorCode = "DUPLICATE_TITLE" as ErrorCode;');
    expect(errors).toContain('errorCode = "EmptyNameError" as ErrorCode;');
    await runTsc(outDir);
  });

  it("give one class to an error several operations define alike, and warn when its descriptions differ", async () => {
    await generate(
      specWithErrors(
        [
          error({
            name: "DuplicateTitleError",
            code: "DUPLICATE_TITLE",
            description: "The id is taken",
          }),
        ],
        [
          error({
            name: "DuplicateTitleError",
            code: "DUPLICATE_TITLE",
            description: "The name is taken",
          }),
        ],
      ),
    );

    const errors = readFileSync(errorFile, "utf8");
    expect(errors.match(/export class DuplicateTitleError /g)).toHaveLength(1);
    expect(errors).toContain('export type ErrorCode = "DUPLICATE_TITLE";');
    expect(errors).toContain("SetTestId: { DuplicateTitleError }");
    expect(errors).toContain("SetTestName: { DuplicateTitleError }");
    expect(warn.mock.calls.flat().join("\n")).toContain(
      'Module "base_operations" defines the error DuplicateTitleError in SET_TEST_ID and SET_TEST_NAME with different descriptions',
    );
  });

  it("reject an error name defined with two codes, before writing anything", async () => {
    const spec = specWithErrors(
      [error({ name: "DuplicateTitleError", code: "DUPLICATE_TITLE" })],
      [error({ name: "DuplicateTitleError", code: "TITLE_TAKEN" })],
    );

    const failure = await generate(spec).then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(String(failure)).toContain(
      'Module "base_operations" defines the error DuplicateTitleError with code "DUPLICATE_TITLE" in SET_TEST_ID and code "TITLE_TAKEN" in SET_TEST_NAME.',
    );
    expect(
      existsSync(join(outDir, "document-models/test-doc/test-doc.json")),
    ).toBe(false);
  });
});
