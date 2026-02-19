import { describe, expect, it } from "vitest";

const SWITCHBOARD_PORT = 4001;
const GRAPHQL_URL = `http://localhost:${SWITCHBOARD_PORT}/graphql`;

describe("HTTP Registry E2E", () => {
  it("should load vetra document models from HTTP registry", async () => {
    // Query the GraphQL schema to check for vetra types
    const introspectionQuery = `
      query {
        __schema {
          types {
            name
          }
        }
      }
    `;

    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: introspectionQuery }),
    });

    expect(response.ok).toBe(true);
    const data = (await response.json()) as {
      data: { __schema: { types: { name: string }[] } };
    };

    // Check that vetra document types are present in the schema
    const typeNames = data.data.__schema.types.map((t) => t.name);

    // Vetra should have registered its document model types
    // These are the document models from @powerhousedao/vetra
    const hasVetraTypes =
      typeNames.some((n) => n.includes("Vetra")) ||
      typeNames.some((n) => n.includes("App")) ||
      typeNames.some((n) => n.includes("Subgraph")) ||
      typeNames.some((n) => n.includes("Processor"));

    expect(hasVetraTypes).toBe(true);
  });

  it("should have document model operations available", async () => {
    // Query for available document types
    const query = `
      query {
        __type(name: "Query") {
          fields {
            name
          }
        }
      }
    `;

    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    expect(response.ok).toBe(true);
    const data = (await response.json()) as {
      data: { __type: { fields: { name: string }[] } };
    };

    // Should have query fields available
    expect(data.data.__type.fields.length).toBeGreaterThan(0);
  });

  it("should have vetra subgraphs registered", async () => {
    // Query for vetra-specific types
    const query = `
      query {
        __type(name: "AppModule") {
          name
          kind
        }
      }
    `;

    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    expect(response.ok).toBe(true);
    const data = (await response.json()) as {
      data: { __type: { name: string; kind: string } | null };
    };

    // AppModule type should exist from vetra package
    expect(data.data.__type).not.toBeNull();
    expect(data.data.__type?.name).toBe("AppModule");
  });
});
