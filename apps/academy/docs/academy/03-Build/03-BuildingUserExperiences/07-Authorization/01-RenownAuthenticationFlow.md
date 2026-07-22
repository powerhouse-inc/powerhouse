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

- A credential is generated, allowing the DID to sign operations on behalf of the user. This credential is stored on a Powerhouse-hosted identity node.
- The identity node ensures that the credentials are securely stored and verifiable across the network. Credentials include the user's signing permissions and are linked to the DID.
- Powerhouse aims to decentralize this identity reactor over time while maintaining an efficient hub for using your decentralized identity and reputation to explore different organizations.

#### 4. Operation signing with Connect

- Connect uses the newly created DID to sign operations performed by the user. For example, when a document or transaction is edited in Connect, the operation is signed with the user's DID.
- This ensures that every action taken within the Connect system is linked to the user's decentralized identity, maintaining transparency and accountability.

<figure className="image-container">
  <img src={require("./images/OperationsHistory.png").default} alt="Renown Login" />
  <figcaption>Your DID is used to sign operations performed by the user.</figcaption>
</figure>

#### 5. Switchboard verification

- Once an operation is signed by the DID through Connect, it is sent to Switchboard for verification.
- Switchboard verifies whether the DID has a valid credential stored on the Powerhouse identity node and if the DID was indeed the one that signed the operation.
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

### In-page sign-in in Connect (wallet adapters)

By default, Connect authenticates by **redirecting** the user to the Renown portal to connect a wallet and mint the credential, then returning to the app. Connect can also sign in **in-page** — the user picks a login method inside Connect, signs the credential there, and it is written and logged in via Switchboard without ever leaving the app.

In-page sign-in is opt-in and configured entirely through `powerhouse.config.json`:

- **`connect.renown.switchboardUrl`** — the Switchboard GraphQL endpoint. When set, Connect attempts in-page sign-in; if it is absent (or no wallet session can be produced) Connect falls back to the redirect flow automatically, so nothing breaks when it is left unset.
- **`connect.renown.adapters`** — selects the wallet adapters that power in-page sign-in. Presence of a key enables that adapter:
  - **`rainbow`** (`{ walletConnectProjectId }`) — external wallets via RainbowKit + wagmi.
  - **`privy`** (`{ appId, clientId?, methods? }`) — embedded wallets plus social / email login via Privy. `methods` defaults to `["google", "email"]`.

```json
"renown": {
  "url": "https://www.renown.id",
  "switchboardUrl": "https://switchboard.example/graphql",
  "adapters": {
    "rainbow": { "walletConnectProjectId": "..." },
    "privy": { "appId": "...", "methods": ["google", "email"] }
  }
}
```

Each adapter's wallet libraries are optional peer dependencies, dynamically imported only on the first login click — so enabling in-page auth adds nothing to startup cost. Install the peer dependencies for the adapters you enable (see the Renown SDK `README`). Social and email login run inside Privy's own modal (OAuth in a popup, so the page stays alive and sign-in completes in-page). Only **public** identifiers belong in the config — a Privy **App Secret** is server-only and must never be placed in `powerhouse.config.json`. Each social/email method must be enabled in the Privy dashboard, with Connect's origin allowlisted.

### Adding in-page sign-in to your own app

Connect wires this through configuration, but any React app can add the same in-page sign-in using the primitives in `@powerhousedao/reactor-browser/renown`. There are three steps:

1. **Initialize the SDK** — render `<Renown appName namespace switchboardUrl />` once, high in your tree. The `switchboardUrl` enables in-page sign-in; omit it to fall back to the redirect flow.
2. **Mount `<RenownWalletProvider adapters={…} theme={…}>`** around your app. It registers the login activator, lazy-loads the configured adapters on the first click, and merges them into one controller. The adapter libraries are optional peer dependencies loaded on demand — nothing wallet-related runs at startup.
3. **Build the login UI** with `useRenownLoginMethods(adapters)` (derives the button list from the same config) and `useRenownAuth()` (`login(session?, method?)`, `user`, `pending`, `error`, `logout`). Call `login(undefined, method.id)` per button.

```tsx
import {
  Renown,
  RenownWalletProvider,
  useRenownAuth,
  useRenownLoginMethods,
} from "@powerhousedao/reactor-browser/renown";

const adapters = {
  rainbow: { walletConnectProjectId: "..." },
  privy: { appId: "...", methods: ["google", "email"] },
};

function Providers({ children }) {
  return (
    <>
      <Renown appName="my-app" switchboardUrl="https://switchboard.example/graphql" />
      <RenownWalletProvider adapters={adapters} theme="light">
        {children}
      </RenownWalletProvider>
    </>
  );
}

function Login() {
  const { user, login, pending, logout } = useRenownAuth();
  const methods = useRenownLoginMethods(adapters);
  if (user) return <button onClick={() => void logout()}>Log out</button>;
  return methods.map((m) => (
    <button key={m.id} disabled={pending} onClick={() => login(undefined, m.id)}>
      {m.label}
    </button>
  ));
}
```

In Next.js / SSR apps, load this subtree client-only (e.g. `next/dynamic` with `ssr: false`), since the wallet libraries are browser-only. A complete Next.js reference lives in the monorepo at `test/test-fusion`. See the `@powerhousedao/reactor-browser` README ("Renown in-page sign-in") for the full API.

### Testing sign-in (mock adapter)

Real wallets and Google OAuth can't run in headless CI, so `@renown/sdk` ships a **mock wallet adapter** (`@renown/sdk/wallet/mock`) for e2e/dev. Enable it via the `mock` key and it becomes a headless signer backed by a local key (real EIP-712 signatures, no wallet extension or OAuth), so sign-in runs deterministically:

```tsx
<RenownWalletProvider adapters={{ mock: { methods: ["wallet", "google", "email"] } }}>
```

It is **TEST/DEV only** — it signs with a well-known key and must never be enabled in production. Runnable Playwright examples: `test/test-fusion/e2e` (full mock sign-in flow) and `test/vetra-e2e` (Connect login surface).

:::info
**Key Components used during login-flow**

- **Renown**: Manages user identities via DID creation and Ethereum wallet integration.
- **Powerhouse Identity Node**: Hosts user credentials and enables verification. Powerhouse is working towards decentralizing this identity reactor over time.
- **Connect**: The interface for users to perform operations. It uses the DID for signing operations.
- **Switchboard**: Responsible for verifying credentials and operation signatures to ensure authenticity.
  :::

This flow ensures that all actions within the Powerhouse ecosystem are secure, transparent, and verifiable, promoting trust in a pseudonymous contributor environment.
