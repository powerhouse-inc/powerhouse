import { exec } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { describe, it } from "vitest";
import { generateDocumentModel } from "../hygen.js";
import { loadDocumentModel } from "../utils.js";

describe("document model", () => {
  it("should generate a document model", async ({ expect }) => {
    const srcPath = path.join(
      process.cwd(),
      "src",
      "codegen",
      "__tests__",
      "data",
      "document-models",
    );

    const outPath = path.join(
      process.cwd(),
      "src",
      "codegen",
      "__tests__",
      ".out",
    );

    // make sure to remove the outPath directorys
    await rm(outPath, { recursive: true, force: true });

    const documentModel = await loadDocumentModel(
      path.join(srcPath, "billing-statement.json"),
    );

    await generateDocumentModel(documentModel, outPath, { skipFormat: true });

    const promise = new Promise((resolve, reject) => {
      const child = exec(
        "npx tsc --project tsconfig.document-model.test.json",
        { cwd: process.cwd() },
      );
      child.stdout?.on("data", (data) => {
        console.log(data);
      });
      child.stderr?.on("data", (data) => {
        console.error(data);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(new Error(`tsc failed with code ${code}`));
        }
      });
    });

    await promise;
  });
});
