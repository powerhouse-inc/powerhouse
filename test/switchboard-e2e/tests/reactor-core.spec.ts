/**
 * Reactor Core E2E Tests
 *
 * ✅ These tests are WORKING
 *
 * Tests basic Powerhouse Reactor functionality:
 * - GraphQL endpoint health
 * - Drive operations
 * - System subgraph queries
 */

import { expect, test } from "@playwright/test";

const GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";

let driveId: string;

async function graphql(
  request: any,
  query: string,
  variables: Record<string, any> = {},
) {
  const response = await request.post(GRAPHQL_ENDPOINT, {
    headers: { "Content-Type": "application/json" },
    data: { query, variables },
  });
  return response.json();
}

function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

test.describe("Reactor Core", () => {
  test.describe.configure({ mode: "serial" });

  test("Reactor is running and GraphQL endpoint responds", async ({
    request,
  }) => {
    const result = await graphql(
      request,
      `query { __schema { queryType { name } } }`,
    );
    expect(result.data.__schema.queryType.name).toBe("Query");
    console.log("✅ Reactor GraphQL endpoint is responding");
  });

  test("Can create a drive", async ({ request }) => {
    const driveName = uniqueName("test-drive");

    const result = await graphql(
      request,
      `
      mutation DriveCreation($name: String!) {
        addDrive(name: $name) {
          id
          slug
          name
        }
      }
    `,
      { name: driveName },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data.addDrive.id).toBeTruthy();
    expect(result.data.addDrive.name).toBe(driveName);
    driveId = result.data.addDrive.id;
    console.log(`✅ Created drive: ${driveName} (ID: ${driveId})`);
  });

  test("Can list drives", async ({ request }) => {
    const result = await graphql(
      request,
      `
      query {
        drives
      }
    `,
    );

    expect(result.errors).toBeUndefined();
    expect(Array.isArray(result.data.drives)).toBe(true);
    expect(result.data.drives.length).toBeGreaterThanOrEqual(1);
    console.log(`✅ Found ${result.data.drives.length} drive(s)`);
    console.log(`   Drive IDs: ${result.data.drives.join(", ")}`);
  });

  test("Can query system info", async ({ request }) => {
    const result = await graphql(
      request,
      `
      query {
        system {
          auth {
            me {
              address
            }
          }
        }
      }
    `,
    );

    // System query should work (even if auth returns null)
    expect(result.errors).toBeUndefined();
    console.log("✅ System subgraph is accessible");
  });
});

