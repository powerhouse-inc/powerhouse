---
# sidebar_position: 1
sidebar_label: Renown Login Flow
displayed_sidebar: renownSidebar
---

# Renown Login Flow

The Renown login flow leverages decentralized identity (DID) creation and the Ceramic network for credential storage and verification, ensuring secure and verifiable actions within decentralized organizations. Below is a detailed breakdown of the process, aimed at developers integrating the Renown, Connect, and Switchboard components.

### Overview
Renown provides a decentralized identity and reputation hub, where users connect their Ethereum address, creating a Decentralized Identifier (DID) tied to their wallet. The system uses Ceramic for credential generation and storage. Credentials are later verified through Switchboard for secure operation management.

### Detailed Flow

#### 1. User Login via Wallet Connection
- The user starts by logging into Renown using their Ethereum address. This is done by signing a message with their wallet.
- The Ethereum key is used to create a DID (Decentralized Identifier), which uniquely represents the user without exposing their personal identity.

#### 2. DID Creation
- A Decentralized Identifier (DID) is created based on the user's Ethereum key. The DID follows a specific format:  
  `did:example:123456789abcdefghijk`
- This DID acts as the user's digital identifier across decentralized systems.

#### 3. Credential Generation
- A credential is generated, allowing the DID to sign operations on behalf of the user. This credential is stored on Ceramic, a decentralized data stream network.
- Ceramic ensures that the credentials are securely stored and verifiable across the network. Credentials include the user's signing permissions and are linked to the DID.

#### 4. Operation Signing with Connect
- Connect uses the newly created DID to sign operations performed by the user. For example, when a document or transaction is edited in Connect, the operation is signed with the user's DID.
- This ensures that every action taken within the Connect system is linked to the user's decentralized identity, maintaining transparency and accountability.

#### 5. Switchboard Verification
- Once an operation is signed by the DID through Connect, it is sent to Switchboard for verification.
- Switchboard verifies whether the DID has a valid credential stored on Ceramic and if the DID was indeed the one that signed the operation.
- The request includes critical metadata such as the user's Ethereum address, the DID, the signed operation, and other parameters required for validation.

  ```json
  {
    "signerAddress": "0x1234...",
    "hash": "did:key:2be4x...",
    "signatureBytes": "Xmqy8FNz...",
    "isVerified": true
  } 
  ```

#### 6. Operation Validation and Execution
- After Switchboard validates the operation, it ensures the operation context is accurate and the credentials match the signer. 
- The operation is then either approved or rejected based on the verification results.
- Approved operations are processed, and changes made within the Connect system are synchronized across the relevant nodes.

:::info
**Key Components used during login-flow**
- **Renown**: Manages user identities via DID creation and Ethereum wallet integration.
- **Ceramic**: Decentralized data stream where user credentials are stored and verified. 
- **Connect**: The interface for users to perform operations. It uses the DID for signing operations.
- **Switchboard**: Responsible for verifying credentials and operation signatures to ensure authenticity.
:::

This flow ensures that all actions within the Powerhouse ecosystem are secure, transparent, and verifiable, promoting trust in a pseudonymous contributor environment.