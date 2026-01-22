import { describe, expect, test } from "vitest";
import { executeGraphQL, gql } from "./utils/graphql-client.js";

/**
 * Test suite for Drive operations
 * Tests basic drive listing functionality
 */
describe("Drives", () => {
  /**
   * Test #1: Drive Listing
   * Verifies the GraphQL drives query returns a non-empty array of drive IDs
   */
  test("Should list available drives and find at least one", async () => {
    // Query to list all drives - drives returns an array of drive IDs
    const query = gql`
      query ListDrives {
        drives
      }
    `;

    interface DrivesResponse {
      drives: string[];
    }

    const response = await executeGraphQL<DrivesResponse>(query);

    // Check that we have at least 1 drive
    expect(response.drives).toBeDefined();
    expect(response.drives.length).toBeGreaterThanOrEqual(1);

    console.log(`✅ Found ${response.drives.length} drive(s):`);
    response.drives.forEach((driveId) => {
      console.log(`  - Drive ID: ${driveId}`);
    });
  });
});
