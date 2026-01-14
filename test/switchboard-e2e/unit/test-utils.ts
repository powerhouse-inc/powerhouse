/**
 * Test utilities for switchboard-e2e unit tests
 * 
 * Based on patterns from packages/reactor-api/test/utils.ts
 * but focused on switchboard-specific test needs
 */

import { ReactorBuilder, driveDocumentModelModule } from "document-drive";
import type { DocumentModelModule, PHDocument } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { ExpectStatic } from "vitest";

/**
 * Matcher for UTC timestamps in ISO 8601 format
 * @example expect(timestamp).toBe(expectUTCTimestamp(expect))
 */
export function expectUTCTimestamp(expect: ExpectStatic): unknown {
  return expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/i);
}

/**
 * Matcher for UUIDs (v1-v5)
 * @example expect(id).toBe(expectUUID(expect))
 */
export function expectUUID(expect: ExpectStatic): unknown {
  return expect.stringMatching(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
}

/**
 * Creates a basic reactor with core document models for testing
 * This is the minimal setup needed for E2E test infrastructure
 */
export async function setupBasicReactor() {
  const reactor = new ReactorBuilder([
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as unknown as DocumentModelModule[]).build();
  
  await reactor.initialize();
  
  return { reactor, listenerManager: reactor.listeners };
}

/**
 * Creates a reactor with additional document models
 * Use this when you have custom document models to test
 * 
 * @param additionalModules - Document model modules to add beyond core models
 */
export async function setupReactorWithModules(
  additionalModules: DocumentModelModule[] = [],
) {
  const allModules = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
    ...additionalModules,
  ] as unknown as DocumentModelModule[];

  const reactor = new ReactorBuilder(allModules).build();
  await reactor.initialize();

  return { reactor, listenerManager: reactor.listeners };
}

/**
 * Helper to get the latest operation index for each scope in a document
 * Useful for verifying operation history in tests
 */
export function getDocumentScopeIndexes(document: PHDocument) {
  return Object.entries(document.operations).reduce(
    (acc, [scope, ops]) => ({
      ...acc,
      [scope]: ops && ops.length > 0 ? ops[ops.length - 1]?.index : -1,
    }),
    {} as Record<string, number>,
  );
}

/**
 * Creates a mock GraphQL context for testing subgraph resolvers
 * Follows the pattern used in reactor-api tests
 */
export function createMockContext(options: {
  driveId?: string;
  isAdmin?: boolean;
  isUser?: boolean;
  isGuest?: boolean;
  userAddress?: string;
}) {
  return {
    driveId: options.driveId,
    user: options.userAddress ? { address: options.userAddress } : undefined,
    isAdmin: () => options.isAdmin ?? false,
    isUser: () => options.isUser ?? false,
    isGuest: () => options.isGuest ?? true,
  };
}

/**
 * Waits for a condition to be true within a timeout
 * Useful for testing async processors or event handlers
 * 
 * @param condition - Function that returns true when condition is met
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param intervalMs - How often to check the condition
 */
export async function waitForCondition(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await Promise.resolve(condition());
    if (result) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(
    `Condition not met within ${timeoutMs}ms timeout`,
  );
}
