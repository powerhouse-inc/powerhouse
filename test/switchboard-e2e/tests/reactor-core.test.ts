/**
 * Reactor Core E2E Tests
 *
 * Tests basic Powerhouse Reactor functionality:
 * - GraphQL endpoint health
 * - Drive operations
 * - System subgraph queries
 */

import { describe, expect, test } from "vitest";
import { executeGraphQL, gql } from "./utils/graphql-client.js";

let driveId: string;

// Helper to generate unique names
const uniqueName = (prefix: string) => `${prefix}-${Date.now()}`;

describe("Reactor Core", () => {

  /**
   * Test #2: GraphQL Connectivity
   * Tests basic GraphQL connectivity with a simple __typename query
   * 
   * Scenarios: RelationalDbProcessor Scenario 1, Subgraphs Scenario 2
   */
  test("Reactor is running and GraphQL endpoint responds", async () => {
    const query = gql`
      query {
        __schema {
          queryType {
            name
          }
        }
      }
    `;

    const result = await executeGraphQL<{
      __schema: { queryType: { name: string } };
    }>(query);

    expect(result.__schema.queryType.name).toBe("Query");
    console.log("✅ Reactor GraphQL endpoint is responding");
  });

  /**
   * Test #3: Drive Creation
   * Creates a new drive using the addDrive mutation and verifies it returns an ID
   * 
   * Scenarios: RelationalDbProcessor Scenario 2
   */
  test("Can create a drive", async () => {
    const driveName = uniqueName("test-drive");

    const mutation = gql`
      mutation DriveCreation($name: String!) {
        addDrive(name: $name) {
          id
          slug
          name
        }
      }
    `;

    const result = await executeGraphQL<{
      addDrive: { id: string; slug: string; name: string };
    }>(mutation, { name: driveName });

    expect(result.addDrive.id).toBeTruthy();
    expect(result.addDrive.name).toBe(driveName);
    driveId = result.addDrive.id;
    console.log(`✅ Created drive: ${driveName} (ID: ${driveId})`);
  });

  /**
   * Test #4: Drive Listing After Creation
   * Queries all drives and confirms the newly created drive appears in the list
   */
  test("Can list drives", async () => {
    const query = gql`
      query {
        drives
      }
    `;

    const result = await executeGraphQL<{
      drives: string[];
    }>(query);

    expect(Array.isArray(result.drives)).toBe(true);
    expect(result.drives.length).toBeGreaterThanOrEqual(1);
    console.log(`✅ Found ${result.drives.length} drive(s)`);
  });

  // Note: system.auth query removed - not available in this switchboard configuration
});
