# Renown authentication flow

The Renown login flow leverages decentralized identity (DID) creation and the Ceramic network for credential storage and verification, ensuring secure and verifiable actions within decentralized organizations. Below is a detailed breakdown of the process, aimed at developers integrating the Renown, Connect, and Switchboard components.

### Renown in the decentralized workplace

Renown provides a decentralized identity and reputation hub, where users connect their Ethereum address, creating a **Decentralized Identifier (DID)** tied to their wallet.

#### Why an integrated identity solution?

Renown is designed to address the challenge of trust within DAOs, where contributors often operate under pseudonyms. In traditional organizations, personal identity and reputation are key to establishing trust and accountability. Renown replicates this dynamic in the digital space, allowing contributors to earn experience and build reputation without revealing their real-world identities. Over time, contributors can share their pseudonymous profiles with other organizations as cryptographic resumes, helping to secure new opportunities while maintaining privacy.

### Detailed login flow

#### 1. User login via wallet connection

- The user starts by logging into Renown using their Ethereum address. This is done by signing a message with their wallet.
- The Ethereum key is used to create a DID (Decentralized Identifier), which uniquely represents the user without exposing their personal identity.

<figure className="image-container">
  <img src={require("./images/ConnectAddress.png").default} alt="Connect Address" />
  <figcaption>Connecting your Ethereum address to generate Decentralized Identifier with Renown.</figcaption>
</figure>

#### 2. DID creation

- A Decentralized Identifier (DID) is created based on the user's Ethereum key. The DID follows a specific format:  
  `did:example:123456789abcdefghijk`
- This DID acts as the user's digital identifier across decentralized systems.

#### 3. Credential generation

- A credential is generated, allowing the DID to sign operations on behalf of the user. This credential is stored on Ceramic, a decentralized data stream network.
- Ceramic ensures that the credentials are securely stored and verifiable across the network. Credentials include the user's signing permissions and are linked to the DID.

#### 4. Operation signing with Connect

- Connect uses the newly created DID to sign operations performed by the user. For example, when a document or transaction is edited in Connect, the operation is signed with the user's DID.
- This ensures that every action taken within the Connect system is linked to the user's decentralized identity, maintaining transparency and accountability.

<figure className="image-container">
  <img src={require("./images/OperationsHistory.png").default} alt="Renown Login" />
  <figcaption>Your DID is used to sign operations performed by the user.</figcaption>
</figure>

#### 5. Switchboard verification

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

#### 6. Operation validation and execution

- After Switchboard validates the operation, it ensures the operation context is accurate and the credentials match the signer.
- The operation is then either approved or rejected based on the verification results.
- Approved operations are processed, and changes made within the Connect system are synchronized across the relevant nodes.

<img src="/img/Renown Intro Diagram.png" alt="renown diagram"/>
*An overview of the Holder - Issuer - Verifier relationship that the decentralised identity system Renown makes use of to establish a self sovereign identity for it's users.*

:::info
**Key Components used during login-flow**

- **Renown**: Manages user identities via DID creation and Ethereum wallet integration.
- **Ceramic**: Decentralized data stream where user credentials are stored and verified.
- **Connect**: The interface for users to perform operations. It uses the DID for signing operations.
- **Switchboard**: Responsible for verifying credentials and operation signatures to ensure authenticity.
  :::

This flow ensures that all actions within the Powerhouse ecosystem are secure, transparent, and verifiable, promoting trust in a pseudonymous contributor environment.
