# CLI Identity & Authentication

This guide covers how to authenticate the Powerhouse CLI with your Ethereum identity and use that identity in the Switchboard for authenticated operations with remote services.

## Overview

The Powerhouse CLI uses **Renown** for identity management. When you run `ph login`, the CLI:

1. Generates a cryptographic keypair (ECDSA P-256) stored locally
2. Creates a DID (Decentralized Identifier) in `did:key:...` format
3. Opens your browser to authorize this DID to act on behalf of your Ethereum address
4. Stores the authorization credentials for future use

This enables the CLI and Switchboard to authenticate with remote drives and services using your Ethereum identity.

## Quick Start

```bash
# 1. Login with your Ethereum wallet
ph login

# 2. Start switchboard with your identity
ph switchboard --use-identity
```

## The Login Command

### Basic Usage

```bash
# Authenticate with Renown
ph login

# Check your authentication status
ph login --status

# Show only your CLI's DID (useful for scripts)
ph login --show-did

# Logout and clear credentials
ph logout
```

### How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│                          ph login                                     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  1. CLI generates/loads keypair (.keypair.json)                      │
│     └─► Creates DID: did:key:zDnae...                                │
│                                                                       │
│  2. Opens browser to Renown portal                                   │
│     └─► URL includes CLI's DID                                       │
│                                                                       │
│  3. User connects wallet & signs authorization                       │
│     └─► "I authorize did:key:zDnae... to act on my behalf"          │
│                                                                       │
│  4. Renown issues credential                                         │
│     └─► Links CLI DID to user's ETH address                         │
│                                                                       │
│  5. CLI stores credentials (.auth.json in project dir)               │
│     └─► Ready to authenticate with remote services                   │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Output Example

```
$ ph login
Initializing cryptographic identity...
CLI DID: did:key:zDnaej4f3d83mmCodYjZyHzUKDSt2dGVKjzD8dd22AS83GtMo

Opening browser for authentication...
Session ID: a1b2c3d4...

Waiting for authentication in browser
(timeout in 300 seconds)

Please connect your wallet and authorize this CLI to act on your behalf.

Waiting.................

Successfully authenticated!
  ETH Address: 0x1234...abcd
  User DID: did:pkh:eip155:1:0x1234...abcd
  CLI DID: did:key:zDnaej4f3d83mmCodYjZyHzUKDSt2dGVKjzD8dd22AS83GtMo

The CLI can now act on behalf of your Ethereum identity.
```

## Storage Locations

All identity files are stored **per-project** in the current working directory:

```
your-project/
├── .keypair.json          # CLI's cryptographic keypair (did:key identity)
├── .auth.json             # Authentication credentials (ETH address, User DID, etc.)
├── powerhouse.config.json
└── ...
```

This means each project can have its own identity and credentials, which is useful for:

- Different projects requiring different identities
- Team members using the same machine
- Separating development and production identities
- Isolating credentials between projects

### Environment Variable

For CI/CD environments, provide the keypair via environment variable:

```bash
# Export keypair as JSON
export PH_RENOWN_PRIVATE_KEY='{"publicKey":{"kty":"EC",...},"privateKey":{"kty":"EC",...}}'

# Now ph login --show-did will use this keypair
ph login --show-did
```

## Using Identity in Switchboard

### Starting with Identity

```bash
# Enable identity using keypair from ph login
ph switchboard --use-identity

# Output includes identity DID:
#    ➜  Switchboard: http://localhost:4001
#    ➜  Identity: did:key:zDnaej4f3d83mmCodYjZyHzUKDSt2dGVKjzD8dd22AS83GtMo
```

### Identity Options

| Option                  | Description                           |
| ----------------------- | ------------------------------------- |
| `--use-identity`        | Enable identity using `.keypair.json` |
| `--keypair-path <path>` | Use a custom keypair file             |
| `--require-identity`    | Fail if no keypair exists             |

### Requiring Identity

Use `--require-identity` when the switchboard must have a valid identity:

```bash
# Fails if no keypair exists (user must run ph login first)
ph switchboard --require-identity

# Error if not logged in:
# Error: Identity required but failed to initialize. Run "ph login" first.
```

### Custom Keypair Path

```bash
# Use a specific keypair file
ph switchboard --use-identity --keypair-path /path/to/my-keypair.json
```

## How the Switchboard Uses Identity

When the Switchboard starts with identity enabled, it can:

1. **Authenticate with Remote Drives**: Generate bearer tokens for API requests
2. **Sign Operations**: Cryptographically sign document operations
3. **Identify Itself**: Present its DID to remote services

### Getting Bearer Tokens

The Switchboard can generate bearer tokens for authenticated API calls:

```typescript
import { getBearerToken, getConnectDid } from "@powerhousedao/switchboard";

// Get the switchboard's DID
const did = await getConnectDid();
console.log("Switchboard DID:", did);

// Get a bearer token for a remote drive
const token = await getBearerToken("https://remote.drive.example.com");
console.log("Bearer Token:", token);

// Use in API requests
const response = await fetch("https://remote.drive.example.com/api/documents", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

## Security Considerations

### Identity Files Protection

The `.keypair.json` and `.auth.json` files contain sensitive data. Protect them:

```bash
# Add to .gitignore
echo ".keypair.json" >> .gitignore
echo ".auth.json" >> .gitignore

# Set restrictive permissions (Unix)
chmod 600 .keypair.json .auth.json
```

### CI/CD Best Practices

For automated environments:

1. **Use environment variables** instead of files
2. **Store secrets securely** (GitHub Secrets, AWS Secrets Manager, etc.)
3. **Rotate keys** periodically
4. **Limit scope** - use separate identities for different environments

```yaml
# GitHub Actions example
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup identity
        env:
          PH_RENOWN_PRIVATE_KEY: ${{ secrets.PH_KEYPAIR }}
        run: |
          ph switchboard --use-identity &
```

### Authorization Scope

When you authorize the CLI's DID:

- It can act on behalf of your Ethereum address
- It can authenticate with services that trust Renown
- It **cannot** sign Ethereum transactions or access your wallet

## Troubleshooting

### "No existing keypair found"

```bash
$ ph switchboard --require-identity
Error: Identity required but failed to initialize. Run "ph login" first.
```

**Solution**: Run `ph login` to create a keypair:

```bash
ph login
# Then retry
ph switchboard --require-identity
```

### "Authentication timed out"

The browser authentication didn't complete in time.

**Solutions**:

- Increase timeout: `ph login --timeout 600`
- Check browser opened correctly
- Ensure you completed the wallet connection

### Different DID than expected

Each project directory has its own `.keypair.json`.

**Check current DID**:

```bash
ph login --show-did
```

**Use specific keypair**:

```bash
ph switchboard --use-identity --keypair-path ~/.shared-keypair.json
```

## API Reference

### Login Options

| Option         | Type    | Default                        | Description            |
| -------------- | ------- | ------------------------------ | ---------------------- |
| `--renown-url` | string  | `https://renown.powerhouse.io` | Renown server URL      |
| `--timeout`    | number  | `300`                          | Auth timeout (seconds) |
| `--logout`     | boolean | `false`                        | Clear credentials      |
| `--status`     | boolean | `false`                        | Show auth status       |
| `--show-did`   | boolean | `false`                        | Print DID only         |

### Switchboard Identity Options

| Option               | Type    | Default         | Description          |
| -------------------- | ------- | --------------- | -------------------- |
| `--use-identity`     | boolean | `false`         | Enable identity      |
| `--keypair-path`     | string  | `.keypair.json` | Keypair file path    |
| `--require-identity` | boolean | `false`         | Fail without keypair |

### Exported Functions (Switchboard)

```typescript
// Get the ConnectCrypto instance
function getConnectCrypto(): IConnectCrypto | null;

// Get the switchboard's DID
async function getConnectDid(): Promise<string | null>;

// Get a bearer token for a remote URL
async function getBearerToken(
  driveUrl: string,
  address?: string,
  refresh?: boolean,
): Promise<string | null>;
```

## Related Documentation

- [Renown SDK Overview](./00-Overview.md) - Introduction to Renown
- [Authentication Guide](./01-Authentication.md) - Web app authentication
- [API Reference](./02-APIReference.md) - Full SDK reference
