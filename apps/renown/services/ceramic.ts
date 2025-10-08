import { ComposeClient } from "@composedb/client";
import type { RuntimeCompositeDefinition } from "@composedb/types";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import KeyResolver from "key-did-resolver";
import { fromString } from "uint8arrays/from-string";
import { definition } from "../ceramic/__generated__/definition.js";
import { PowerhouseVerifiableCredential, getAddressDID } from "./credential";

export type CeramicPowerhouseVerifiableCredential = Omit<
    PowerhouseVerifiableCredential,
    "@context"
> & {
    context: PowerhouseVerifiableCredential["@context"];
};

export const compose = new ComposeClient({
    ceramic: process.env.NEXT_PUBLIC_CERAMIC_URL || "http://localhost:7007",
    definition: definition as RuntimeCompositeDefinition,
});

export async function getCredentials(
    address: string,
    chainId: number,
    connectId: string,
    date: string = new Date().toISOString()
) {
    const issuerId = getAddressDID(address, chainId);
    const query = `query VerifiableCredentialEIP712($input: VerifiableCredentialEIP712FiltersInput!) {
      verifiableCredentialEIP712Index(first: 1, sorting: { issuanceDate: DESC }, filters: $input) {
        edges {
          node {
            id
            controller {
              id
            }
            issuer {
              id
            }
            context
            type
            credentialSchema {
              id
              type
            }
            credentialSubject {
              id {
                id
              }
              app
              name
            }
            issuanceDate
            expirationDate
            revocationDate
            proof {
              verificationMethod
              created
              proofPurpose
              type
              proofValue
              eip712 {
                domain {
                  chainId
                  name
                  version
                }
                types {
                  EIP712Domain {
                    name
                    type
                  }
                  CredentialSchema {
                    name
                    type
                  }
                  CredentialSubject {
                    name
                    type
                  }
                  Issuer {
                    name
                    type
                  }
                  VerifiableCredential {
                    name
                    type
                  }
                }
                primaryType
              }
            }
          }
        }
      }
    }`;

    return compose.executeQuery<{
        verifiableCredentialEIP712Index: {
            edges: { node: CeramicPowerhouseVerifiableCredential }[];
        };
    }>(query, {
        input: {
            and: [
                {
                    where: {
                        issuerId: {
                            equalTo: issuerId,
                        },
                        subjectId: {
                            equalTo: connectId,
                        },
                    },
                },
                {
                    or: [
                        {
                            where: {
                                revocationDate: {
                                    greaterThan: date,
                                },
                            },
                        },
                        {
                            where: {
                                revocationDate: {
                                    isNull: true,
                                },
                            },
                        },
                    ],
                },
            ],
        },
    });
}

export async function storeCredential(
    credential: PowerhouseVerifiableCredential
) {
    console.time("compose.did.authenticate");
    await compose.did?.authenticate();
    console.timeEnd("compose.did.authenticate");

    const { verifyingContract, ...domain } = credential.proof.eip712.domain;
    const query = `
    mutation {
      createVerifiableCredentialEIP712(input: {
        content: {
          issuerId: "${credential.issuer.id}"
          subjectId: "${credential.credentialSubject.id}"
          context: [${credential["@context"].map((c) => `"${c}"`).join(", ")}]
          issuer: {
              id: "${credential.issuer.id}"
              ethereumAddress: "${credential.issuer["ethereumAddress"]}"
          }
          issuanceDate: "${credential.issuanceDate}"
          credentialSubject: ${JSON.stringify(
              credential.credentialSubject
          ).replace(/"([^"]+)":/g, "$1:")}
          type: [${credential["type"].map((t) => `"${t}"`).join(", ")}]
          credentialSchema: {
            id: "${credential.credentialSchema.id}"
            type: "${credential.credentialSchema.type}"
          }
          proof: {
            proofPurpose: "${credential.proof.proofPurpose}"
            type: "${credential.proof.type}"
            created: "${credential.proof.created}"
            verificationMethod: "${credential.proof.verificationMethod}"
            proofValue: "${credential.proof.proofValue}"
            eip712: {
              domain: ${JSON.stringify(domain).replace(/"([^"]+)":/g, "$1:")}
              types: ${JSON.stringify(credential.proof.eip712.types).replace(
                  /"([^"]+)":/g,
                  "$1:"
              )}
              primaryType: "${credential.proof.eip712.primaryType}"
            }
          }
        }
      }) 
      {
        document {
          id
          issuer {
            id
            ethereumAddress
          }
          issuanceDate
          type
          context
          credentialSubject {
            id {
              id
            }
            app
            name
          }
          proof{
            type
            proofPurpose
            verificationMethod
            proofValue
            created
            eip712{
              domain{
                name
                version
                chainId
              }
              types {
                EIP712Domain {
                  name
                  type
                }
                CredentialSchema {
                  name
                  type
                }
                CredentialSubject {
                  name
                  type
                }
                Issuer {
                  name
                  type
                }
                VerifiableCredential {
                  name
                  type
                }
              }
              primaryType
            }
          }
        }
      }
    }
  `;
    console.time("createVerifiableCredentialEIP712");
    const result = compose.executeQuery<{
        createVerifiableCredentialEIP712: {
            document: CeramicPowerhouseVerifiableCredential;
        };
    }>(query);
    console.timeEnd("createVerifiableCredentialEIP712");
    return result
}

export async function revokeCredential(id: string) {
    console.time("compose.did.authenticate");
    await compose.did?.authenticate();
    console.timeEnd("compose.did.authenticate");

    const now = new Date().toISOString();
    const query = `
    mutation {
      updateVerifiableCredentialEIP712(input: {
        id: "${id}"
        content: {
          revocationDate: "${now}"
        }
      }) 
      {
        document {
          id
          issuer {
            id
            ethereumAddress
          }
          issuanceDate
          expirationDate
          revocationDate
          type
          context
          credentialSubject {
            id {
              id
            }
            app
            name
          }
          proof {
            type
            proofPurpose
            verificationMethod
            proofValue
            created
            eip712{
              domain{
                name
                version
                chainId
              }
              types {
                EIP712Domain {
                  name
                  type
                }
                CredentialSchema {
                  name
                  type
                }
                CredentialSubject {
                  name
                  type
                }
                Issuer {
                  name
                  type
                }
                VerifiableCredential {
                  name
                  type
                }
              }
              primaryType
            }
          }
        }
      }
    }
  `;

   console.time("updateVerifiableCredentialEIP712");
   const result = compose.executeQuery<{
        updateVerifiableCredentialEIP712: {
            document: CeramicPowerhouseVerifiableCredential;
        };
    }>(query);
    console.timeEnd("updateVerifiableCredentialEIP712");
    return result;
}

export async function authenticateDID() {
    const CERAMIC_SEED = process.env.CERAMIC_SEED;

    if (!CERAMIC_SEED) {
        throw new Error("CERAMIC_SEED is not defined");
    }

    console.time('staticDid.fromString');
    const key = fromString(CERAMIC_SEED, "base16");
    console.timeEnd('staticDid.fromString');
    const provider = new Ed25519Provider(key);
    console.time('staticDid.new');
    const staticDid = new DID({
        resolver: KeyResolver.getResolver(),
        provider,
    });
    console.timeEnd('staticDid.new');
    console.time('staticDid.authenticate');
    await staticDid.authenticate();
    console.timeEnd('staticDid.authenticate');
    compose.setDID(staticDid);
    return staticDid;
}
