// import { v4 as uuidv4 } from "uuid";
// import type { WalletClient } from "viem";
// import { CREDENTIAL_TYPES } from "./constants.js";

// export interface CreateEIP712CredentialParams {
//   walletClient: WalletClient;
//   chainId: number;
//   app: string;
//   connectId?: string;
//   expiresInDays?: number;
// }

// /**
//  * Create and sign an EIP-712 Verifiable Credential
//  */
// export async function createEIP712Credential(
//   params: CreateEIP712CredentialParams,
// ) {
//   const { walletClient, chainId, app, connectId, expiresInDays = 7 } = params;

//   if (!walletClient.account?.address) {
//     throw new Error("Wallet not connected");
//   }

//   const address = walletClient.account.address;
//   const issuerId = `did:pkh:eip155:${chainId}:${address.toLowerCase()}`;
//   const credentialId = `urn:uuid:${uuidv4()}`;
//   const now = new Date();
//   const expirationDate = new Date(
//     now.getTime() + expiresInDays * 24 * 60 * 60 * 1000,
//   );

//   // Build the credential
//   const credential = {
//     "@context": ["https://www.w3.org/2018/credentials/v1"],
//     type: ["VerifiableCredential", "RenownCredential"],
//     id: credentialId,
//     issuer: {
//       id: issuerId,
//       ethereumAddress: address,
//     },
//     credentialSubject: {
//       id: connectId || issuerId,
//       app,
//     },
//     credentialSchema: {
//       id: "https://renown.id/schemas/renown-credential/v1",
//       type: "JsonSchemaValidator2018",
//     },
//     issuanceDate: now.toISOString(),
//     expirationDate: expirationDate.toISOString(),
//   };

//   // EIP-712 domain
//   const domain = {
//     version: "1",
//     chainId: BigInt(chainId),
//   };

//   // Sign with EIP-712
//   const signature = await walletClient.signTypedData({
//     account: walletClient.account,
//     domain,
//     types: CREDENTIAL_TYPES,
//     primaryType: "VerifiableCredential",
//     message: credential,
//   });

//   return {
//     credential,
//     signature,
//     domain,
//   };
// }
