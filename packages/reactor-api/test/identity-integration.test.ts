// /**
//  * Integration tests for identity-based authentication and signed actions.
//  *
//  * This test demonstrates the full flow:
//  * 1. Starting reactor-api with initializeAndStartAPI
//  * 2. Setting up a test identity (keypair) programmatically
//  * 3. Using ConnectCrypto to get bearer tokens
//  * 4. Pushing authenticated requests to reactor-api
//  */
// import { PGlite } from "@electric-sql/pglite";
// import {
//   type Database,
//   EventBus,
//   ReactorBuilder as NewReactorBuilder,
//   ReactorClientBuilder,
//   SyncBuilder,
// } from "@powerhousedao/reactor";
// import {
//   ConnectCrypto,
//   type IConnectCrypto,
//   type JsonWebKeyPairStorage,
//   type JwkKeyPair,
// } from "@renown/sdk";
// import type { IDocumentDriveServer } from "document-drive";
// import {
//   InMemoryCache,
//   MemoryStorage,
//   ReactorBuilder,
//   driveDocumentModelModule,
// } from "document-drive";
// import type { DocumentModelModule } from "document-model";
// import { documentModelDocumentModelModule } from "document-model";
// import { Kysely } from "kysely";
// import { PGliteDialect } from "kysely-pglite-dialect";
// import { afterAll, beforeAll, describe, expect, it } from "vitest";
// import { getUniqueDocumentModels, initializeAndStartAPI } from "../src/index.js";

// /**
//  * In-memory key storage for testing.
//  */
// class TestKeyStorage implements JsonWebKeyPairStorage {
//   private keyPair: JwkKeyPair | undefined;

//   async loadKeyPair(): Promise<JwkKeyPair | undefined> {
//     return this.keyPair;
//   }

//   async saveKeyPair(keyPair: JwkKeyPair): Promise<void> {
//     this.keyPair = keyPair;
//   }

//   getStoredKeyPair(): JwkKeyPair | undefined {
//     return this.keyPair;
//   }
// }

// // Use a random port to avoid conflicts
// const TEST_PORT = 14000 + Math.floor(Math.random() * 1000);
// const BASE_URL = `http://localhost:${TEST_PORT}`;

// describe("Identity Integration with startAPI", () => {
//   let connectCrypto: IConnectCrypto;
//   let testKeyStorage: TestKeyStorage;

//   beforeAll(async () => {
//     // Set up test identity
//     testKeyStorage = new TestKeyStorage();
//     connectCrypto = new ConnectCrypto(testKeyStorage);
//     await connectCrypto.did();

//     // Set up storage
//     const cache = new InMemoryCache();
//     const storage = new MemoryStorage();

//     // Initialize drive server function
//     const initializeDriveServer = async (
//       documentModels: DocumentModelModule[],
//     ) => {
//       const driveServer = new ReactorBuilder(
//         getUniqueDocumentModels([
//           documentModelDocumentModelModule,
//           driveDocumentModelModule,
//           ...documentModels,
//         ] as unknown as DocumentModelModule[]),
//       )
//         .withStorage(storage)
//         .withCache(cache)
//         .build();

//       await driveServer.initialize();
//       return driveServer;
//     };

//     // Initialize client function
//     const initializeClient = async (
//       _driveServer: IDocumentDriveServer,
//       documentModels: DocumentModelModule[],
//     ) => {
//       const eventBus = new EventBus();
//       const pglite = new PGlite();
//       const kysely = new Kysely<Database>({
//         dialect: new PGliteDialect(pglite),
//       });

//       const builder = new NewReactorBuilder()
//         .withEventBus(eventBus)
//         .withDocumentModels(
//           getUniqueDocumentModels([
//             documentModelDocumentModelModule,
//             driveDocumentModelModule,
//             ...documentModels,
//           ] as unknown as DocumentModelModule[]),
//         )
//         .withLegacyStorage(storage)
//         .withSync(new SyncBuilder())
//         .withFeatures({
//           legacyStorageEnabled: true,
//         })
//         .withKysely(kysely);

//       const module = await new ReactorClientBuilder()
//         .withReactorBuilder(builder)
//         .buildModule();

//       const syncManager = module.reactorModule?.syncModule?.syncManager;
//       if (!syncManager) {
//         throw new Error("SyncManager not available from ReactorClientBuilder");
//       }

//       return { client: module.client, syncManager };
//     };

//     // Start the API server
//     await initializeAndStartAPI(initializeDriveServer, initializeClient, {
//       port: TEST_PORT,
//       dbPath: undefined, // Use in-memory database
//       auth: {
//         enabled: false, // Disable auth for basic tests
//         admins: [],
//         users: [],
//         guests: [],
//         freeEntry: true,
//       },
//     });
//   }, 30000);

//   afterAll(async () => {
//     // The server will be cleaned up when the test process exits
//   });

//   describe("Server Health", () => {
//     it("should have the GraphQL endpoint available", async () => {
//       const response = await fetch(`${BASE_URL}/graphql`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           query: `{ __typename }`,
//         }),
//       });

//       expect(response.ok).toBe(true);
//       const data = await response.json();
//       expect(data.data).toBeDefined();
//     });
//   });

//   describe("Identity Setup", () => {
//     it("should generate a DID for the test identity", async () => {
//       const did = await connectCrypto.did();
//       expect(did).toMatch(/^did:key:/);
//     });

//     it("should be able to get issuer for signing", async () => {
//       const issuer = await connectCrypto.getIssuer();
//       expect(issuer).toBeDefined();
//       expect(typeof issuer.did).toBe("string");
//       expect(typeof issuer.signer).toBe("function");
//     });

//     it("should generate a bearer token", async () => {
//       const token = await connectCrypto.getBearerToken(BASE_URL, undefined);
//       expect(token).toBeDefined();
//       expect(typeof token).toBe("string");
//     });
//   });

//   describe("GraphQL Queries", () => {
//     it("should query document models", async () => {
//       const response = await fetch(`${BASE_URL}/graphql`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           query: `
//             query {
//               documentModels {
//                 results {
//                   documentModel {
//                     name
//                     id
//                   }
//                 }
//               }
//             }
//           `,
//         }),
//       });

//       expect(response.ok).toBe(true);
//       const data = (await response.json()) as {
//         data?: { documentModels?: { results?: unknown[] } };
//       };
//       expect(data.data?.documentModels?.results).toBeDefined();
//     });

//     it("should query system info", async () => {
//       const response = await fetch(`${BASE_URL}/graphql`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           query: `
//             query {
//               system {
//                 auth {
//                   me {
//                     address
//                   }
//                 }
//               }
//             }
//           `,
//         }),
//       });

//       expect(response.ok).toBe(true);
//       const data = await response.json();
//       expect(data.data).toBeDefined();
//     });
//   });

//   describe("Authenticated Requests", () => {
//     it("should make authenticated GraphQL request with bearer token", async () => {
//       const token = await connectCrypto.getBearerToken(BASE_URL, undefined);

//       const response = await fetch(`${BASE_URL}/graphql`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({
//           query: `
//             query {
//               documentModels {
//                 results {
//                   documentModel {
//                     name
//                   }
//                 }
//               }
//             }
//           `,
//         }),
//       });

//       expect(response.ok).toBe(true);
//       const data = await response.json();
//       expect(data.data).toBeDefined();
//     });
//   });

//   describe("Action Signing", () => {
//     it("should sign action data with identity", async () => {
//       const issuer = await connectCrypto.getIssuer();

//       // Simulate signing an action
//       const actionData = JSON.stringify({
//         type: "SET_NAME",
//         scope: "global",
//         input: { name: "Test Document" },
//       });

//       const signature = await issuer.signer(actionData);
//       expect(signature).toBeDefined();
//       expect(typeof signature).toBe("string");
//       expect((signature as string).length).toBeGreaterThan(0);
//     });

//     it("should produce signatures for data", async () => {
//       const issuer = await connectCrypto.getIssuer();
//       const testData = "test data";

//       const signature1 = await issuer.signer(testData);
//       const signature2 = await issuer.signer(testData);

//       // ECDSA signatures include randomness, so they may differ
//       // but both should be valid strings
//       expect(signature1).toBeDefined();
//       expect(signature2).toBeDefined();
//     });
//   });

//   describe("Full Workflow", () => {
//     it("should demonstrate complete identity-based API interaction", async () => {
//       // 1. Get identity DID
//       const did = await connectCrypto.did();
//       expect(did).toMatch(/^did:key:/);

//       // 2. Get bearer token for API authentication
//       const token = await connectCrypto.getBearerToken(BASE_URL, undefined);
//       expect(token).toBeDefined();

//       // 3. Get issuer for signing operations
//       const issuer = await connectCrypto.getIssuer();
//       expect(issuer.did).toBe(did);

//       // 4. Make authenticated API call
//       const response = await fetch(`${BASE_URL}/graphql`, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${token}`,
//         },
//         body: JSON.stringify({
//           query: `{ __typename }`,
//         }),
//       });
//       expect(response.ok).toBe(true);

//       // 5. Sign operation data (for when submitting signed operations)
//       const operationData = JSON.stringify({
//         type: "CREATE_DOCUMENT",
//         scope: "global",
//         input: { documentType: "powerhouse/document-model" },
//       });
//       const signature = await issuer.signer(operationData);
//       expect(signature).toBeDefined();
//     });
//   });
// });

// /**
//  * Usage Guide:
//  *
//  * This test demonstrates how to integrate identity-based authentication with reactor-api.
//  *
//  * Prerequisites:
//  * 1. User runs `ph login` to authenticate with Renown
//  * 2. This creates `.auth.json` (user credentials) and `.keypair.json` (signing keys)
//  *
//  * Programmatic Flow:
//  * ```typescript
//  * import { ConnectCrypto, type JsonWebKeyPairStorage } from "@renown/sdk";
//  *
//  * // 1. Create key storage (or use existing from ph login)
//  * class MyKeyStorage implements JsonWebKeyPairStorage {
//  *   async loadKeyPair() { return loadFromFile('.keypair.json'); }
//  *   async saveKeyPair(kp) { saveToFile('.keypair.json', kp); }
//  * }
//  *
//  * // 2. Initialize ConnectCrypto
//  * const crypto = new ConnectCrypto(new MyKeyStorage());
//  * const did = await crypto.did(); // Generates keypair if none exists
//  *
//  * // 3. Get bearer token for API
//  * const token = await crypto.getBearerToken("http://localhost:4000", undefined);
//  *
//  * // 4. Make authenticated requests
//  * fetch("http://localhost:4000/graphql", {
//  *   headers: { "Authorization": `Bearer ${token}` },
//  *   // ...
//  * });
//  *
//  * // 5. Sign operations (for operation-level signatures)
//  * const issuer = await crypto.getIssuer();
//  * const signature = await issuer.signer(JSON.stringify(action));
//  * ```
//  */
