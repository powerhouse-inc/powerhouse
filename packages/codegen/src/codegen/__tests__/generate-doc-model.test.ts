import { exec } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { generateSchemas } from "../graphql.js";
import { generateDocumentModel, generateProcessor } from "../hygen.js";
import { loadDocumentModel } from "../utils.js";

describe("document model", () => {
  const srcPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    "data",
    "billing-statement",
  );

  const outPath = path.join(
    process.cwd(),
    "src",
    "codegen",
    "__tests__",
    ".out",
  );

  beforeAll(async () => {
    // make sure to remove the outPath directory
    await rm(outPath, { recursive: true, force: true });
  });

  const generate = async () => {
    await generateSchemas(path.join(srcPath, ".."), {
      skipFormat: true,
      outDir: path.join(outPath, "document-model"),
    });

    const documentModel = await loadDocumentModel(
      path.join(srcPath, "billing-statement.json"),
    );
    await generateDocumentModel(
      documentModel,
      path.join(outPath, "document-model"),
      { skipFormat: true },
    );
  };

  const compile = () =>
    new Promise((resolve, reject) => {
      const output: { stdout: string[]; stderr: string[] } = {
        stdout: [],
        stderr: [],
      };
      const child = exec(
        "npx tsc --project tsconfig.document-model.test.json",
        { cwd: process.cwd() },
      );
      child.stdout?.on("data", (data) => {
        output.stdout.push(data);
      });
      child.stderr?.on("data", (data) => {
        output.stderr.push(data);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(
            new Error(
              `tsc failed with code ${code}:\n${output.stdout.join("")}\n${output.stderr.join("")}`,
            ),
          );
        }
      });
    });

  it(
    "should generate a document model",
    {
      timeout: 10000,
    },
    async () => {
      await generate();
      await compile();
    },
  );

  it(
    "should generate an analytics processor and factory",
    {
      timeout: 10000,
    },
    async () => {
      await generate();

      await generateProcessor(
        "test-analytics-processor",
        ["billing-statement"],
        {
          "billing-statement": {
            name: "BillingStatement",
            importPath: "../../document-model/billing-statement",
          },
        },
        path.join(outPath, "processors"),
        path.join(outPath, "document-model"),
        "analytics",
        {
          skipFormat: true,
        },
      );

      await compile();
    },
  );
});
