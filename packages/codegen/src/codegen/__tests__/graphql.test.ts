import * as validationPlugin from "@acaldas/graphql-codegen-typescript-validation-schema";
import { codegen } from "@graphql-codegen/core";
import * as typescriptPlugin from "@graphql-codegen/typescript";
import { parse } from "graphql";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scalars, tsConfig, zodConfig } from "../graphql.js";

const documentDriveSchema = readFileSync(
  path.join(fileURLToPath(import.meta.url), "../schema.graphql"),
  "utf-8",
);

describe("graphql codegen", () => {
  it("should generate correct typescript code for schema", async () => {
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
