import * as validationPlugin from "@acaldas/graphql-codegen-typescript-validation-schema";
import { codegen } from "@graphql-codegen/core";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import { parse } from "graphql";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scalars, tsConfig, zodConfig } from "../graphql.js";
import { PURGE_AFTER_TEST } from "./config.js";
import {
  GENERATE_SCHEMAS_TEST_OUTPUT_DIR,
  SCHEMAS_TEST_PROJECT,
} from "./constants.js";
import {
  copyAllFiles,
  getTestDataDir,
  getTestOutDirPath,
  getTestOutputDir,
} from "./utils.js";

describe("graphql codegen", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    GENERATE_SCHEMAS_TEST_OUTPUT_DIR,
  );
  const testDataDir = getTestDataDir(testDir, SCHEMAS_TEST_PROJECT);
  let testOutDirCount = 0;
  let testOutDirPath = getTestOutDirPath(testOutDirCount, outDirName);
  const documentDriveSchema = readFileSync(
    path.join(testDataDir, "schema.graphql"),
    "utf-8",
  );

  async function setupTest(testDataDir: string) {
    testOutDirCount++;
    testOutDirPath = getTestOutDirPath(testOutDirCount, outDirName);

    await copyAllFiles(testDataDir, testOutDirPath);
  }

  beforeAll(() => {
    try {
      rmSync(outDirName, { recursive: true, force: true });
      mkdirSync(outDirName, { recursive: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
  });

  afterAll(() => {
    if (PURGE_AFTER_TEST) {
      rmSync(outDirName, { recursive: true, force: true });
    }
  });

  it("should generate correct typescript code for schema", async () => {
    await setupTest(testDataDir);
    const schema = `
      ${Object.keys(scalars)
        .map((scalar) => `scalar ${scalar}`)
        .join("\n")}
      type User {
        id: ID!
        name: String!
        email: String
        address: Address
        createdAt: DateTime!
      }
      
      type Query {
        user(id: ID!): User
        users: [User!]!
      }
    `;

    const result = await codegen({
      filename: "",
      plugins: [
        {
          typescript: tsConfig,
        },
      ],
      schema: parse(schema),
      documents: [],
      config: {},
      pluginMap: {
        typescript: typescriptPlugin,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("should generate correct zod code for schema", async () => {
    await setupTest(testDataDir);
    const schema = `
      ${Object.keys(scalars)
        .map((scalar) => `scalar ${scalar}`)
        .join("\n")}
      type User {
        id: ID!
        name: String!
        email: String
        address: Address
        createdAt: DateTime!
      }
      
      type Query {
        user(id: ID!): User
        users: [User!]!
      }
    `;

    const result = await codegen({
      filename: "",
      plugins: [
        {
          "graphql-codegen-typescript-validation-schema": zodConfig,
        },
      ],
      schema: parse(schema),
      documents: [],
      config: {},
      pluginMap: {
        "graphql-codegen-typescript-validation-schema": validationPlugin,
      },
    });
    expect(result).toMatchSnapshot();
  });

  it("should generate correct typescript code for drive schema", async () => {
    await setupTest(testDataDir);
    const result = await codegen({
      filename: "",
      plugins: [
        {
          typescript: tsConfig,
        },
      ],
      schema: parse(documentDriveSchema),
      documents: [],
      config: {},
      pluginMap: {
        typescript: typescriptPlugin,
      },
    });
    expect(result).toMatchSnapshot();
  });
  it("should generate correct zod code for drive schema", async () => {
    await setupTest(testDataDir);
    const result = await codegen({
      filename: "",
      plugins: [
        {
          "@acaldas/graphql-codegen-typescript-validation-schema": zodConfig,
        },
      ],
      schema: parse(documentDriveSchema),
      documents: [],
      config: {},
      pluginMap: {
        "@acaldas/graphql-codegen-typescript-validation-schema":
          validationPlugin,
      },
    });
    expect(result).toMatchSnapshot();
  });
});
