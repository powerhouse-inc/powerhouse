# Reactor API Authorization

:::warning Work in Progress
This documentation is still being written and may be incomplete.
The feature is not yet available on production.
:::

This guide explains how to configure **authorization** for the Powerhouse Reactor API. Authorization controls who can access your Reactor and what they can do.

## Introduction

The **Reactor API** is the API interface to a Powerhouse **Reactor**—a storage node responsible for storing documents, resolving conflicts, and verifying document event histories. Before users can interact with documents in your Reactor, they must pass through authorization checks.

### Authorization Model

The Reactor API uses a layered authorization model:

| Component                                               | Purpose                                                    | Scope        |
| ------------------------------------------------------- | ---------------------------------------------------------- | ------------ |
| **Supreme Admin** (`ADMINS` env var)                    | Full bypass of all permission checks                       | Reactor-wide |
| **Document Protection**                                 | Determines whether a document requires explicit grants     | Per-document |
| **[Document Permissions](./02-DocumentPermissions.md)** | Fine-grained READ/WRITE/ADMIN grants on specific documents | Per-document |

:::tip When do I need document permissions?

- For simple setups, configure `ADMINS` and leave documents **unprotected** — any authenticated user can read and write
- When you need fine-grained control, **protect** specific documents and manage access with [document permissions](./02-DocumentPermissions.md)
  :::

## Prerequisites

Before configuring authorization, you need:

1. **A running Reactor**: See [Document Permissions - Starting the Reactor API](./02-DocumentPermissions.md#starting-the-reactor-api) for setup instructions
2. **User Ethereum addresses**: Addresses of users you want to grant admin access to

## Basic Configuration

The Reactor API supports two main ways to configure authorization:

1. Using environment variables
2. Using the powerhouse configuration file

### Environment Variables

Configure authorization using environment variables before starting the Reactor:

```bash
# Required: Enable/disable authentication
AUTH_ENABLED=true

# Optional: Comma-separated list of admin wallet addresses (full access, bypasses all checks)
ADMINS="0x123...,0x456..."

# Optional: Make all new documents protected by default (requires explicit grants)
DEFAULT_PROTECTION=true

# Optional: Enable per-document permission management
DOCUMENT_PERMISSIONS_ENABLED=true
```

**Important notes:**

- Use full Ethereum addresses (e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)
- **ADMINS**: These addresses bypass all permission checks entirely
- **DEFAULT_PROTECTION=true**: New documents are created as protected, requiring explicit grants for access
- **DEFAULT_PROTECTION=false** (default): New documents are unprotected — anyone can read, authenticated users can write
- **DOCUMENT_PERMISSIONS_ENABLED=true**: Enables the per-document permission system for managing grants
- If `AUTH_ENABLED=false`, all authorization checks are bypassed (not recommended for production)

### Powerhouse configuration

Alternatively, you can configure authorization in your `powerhouse.config.json`:

```json
{
  "auth": {
    "enabled": true,
    "admins": ["0x123", "0x456"]
  }
}
```

## How Authorization Works

### Supreme Admin

Addresses listed in `ADMINS` have **full access** to the entire Reactor. They bypass all permission checks, including document protection. Use this for system administrators and project owners.

### Document Protection

Each document (drive, folder, or document) can be either **protected** or **unprotected**:

| State           | Read Access                     | Write Access                    |
| --------------- | ------------------------------- | ------------------------------- |
| **Unprotected** | Anyone                          | Any authenticated user          |
| **Protected**   | Only users with explicit grants | Only users with explicit grants |

- Use `DEFAULT_PROTECTION=true` to make all new documents protected by default
- Protection can also be toggled per-document via the GraphQL API

### Per-Document Grants

When a document is protected, users need explicit grants to access it. Grants are managed through the [Document Permission System](./02-DocumentPermissions.md) and support:

- **Direct grants**: Assigned to a specific user address
- **Group grants**: Assigned to a group of users
- **Inherited grants**: Flow down from parent (drive → folder → document)
- **Grant levels**: READ, WRITE, or ADMIN

## Docker Configuration

When running the Reactor API in Docker, you can pass these configurations as environment variables:

```bash
docker run -e AUTH_ENABLED=true \
           -e ADMINS="0x123,0x456" \
           -e DEFAULT_PROTECTION=true \
           -e DOCUMENT_PERMISSIONS_ENABLED=true \
           your-reactor-api-image
```

## Authorization Flow

Understanding how authorization checks work:

```
User makes API request
     |
Is AUTH_ENABLED=true?
     |-- No --> Access granted (no auth required)
     +-- Yes --> Continue to auth check
          |
Does user have valid bearer token?
     |-- No --> 401 Unauthorized
     +-- Yes --> Extract Ethereum address from token
          |
Is user's address in ADMINS?
     |-- Yes --> Full access (bypass all checks)
     +-- No --> Check document protection
          |
Is the target document protected?
     |-- No --> Read: allow, Write: allow (user is authenticated)
     +-- Yes --> Check grants
          |
Does user have a grant for this document?
     |-- Yes --> Grant-level access (READ/WRITE/ADMIN)
     +-- No --> 403 Forbidden
```

### Step-by-Step

1. **Authentication check**: If `AUTH_ENABLED=false`, all requests are allowed (skip remaining steps)
2. **Token validation**: User must include valid bearer token from `ph access-token`
3. **Supreme admin check**: If the user's address is in `ADMINS`, grant full access
4. **Document protection check**: If the document is unprotected, allow read for everyone and write for authenticated users
5. **Grant check** (protected documents only): Check [document-level permissions](./02-DocumentPermissions.md) for READ/WRITE/ADMIN grants

:::tip Authentication vs Authorization

- **Authentication** ([Renown flow](./01-RenownAuthenticationFlow.md)): Proves who you are (`ph login`)
- **Authorization** (this guide): Determines what you can access
  :::

## Common Scenarios

### Scenario 1: Open Development Environment

You want a local Reactor where anyone can access everything:

```bash
AUTH_ENABLED=false
```

**Use case**: Local development, testing, demos

### Scenario 2: Protected Production Environment

Only admins have unrestricted access, all documents require explicit grants:

```bash
AUTH_ENABLED=true
ADMINS="0xProjectLead"
DEFAULT_PROTECTION=true
DOCUMENT_PERMISSIONS_ENABLED=true
```

**Use case**: Private team workspace, sensitive data. Use [document permissions](./02-DocumentPermissions.md) to grant access to specific users.

### Scenario 3: Open Collaboration with Admin Oversight

Any authenticated user can read and write, admins manage the Reactor:

```bash
AUTH_ENABLED=true
ADMINS="0xProjectLead"
```

**Use case**: Open source projects, community collaboration. Documents are unprotected by default, so any authenticated user can contribute. Protect specific documents as needed.

### Scenario 4: Mixed Access

Some documents are open, others are restricted:

```bash
AUTH_ENABLED=true
ADMINS="0xProjectLead"
DOCUMENT_PERMISSIONS_ENABLED=true
```

**Use case**: Team workspace where most content is open but certain drives/documents are protected with explicit grants.

## Security Best Practices

1. **Secure admin addresses**: Keep admin wallet private keys secure
2. **Use HTTPS in production**: Never expose the Reactor API over plain HTTP
3. **Regular access audits**: Review admin list and document grants periodically
4. **Development vs Production**: Use `AUTH_ENABLED=false` only in local development
5. **Protect sensitive documents**: Use `DEFAULT_PROTECTION=true` or protect individual documents containing sensitive data
6. **Use document permissions**: For production, combine admin access with [document-level permissions](./02-DocumentPermissions.md) for fine-grained control

## Troubleshooting

Common issues and solutions:

### "403 Forbidden" Error

**Problem**: User has valid token but cannot access a document

**Solutions**:

1. Check if the document is protected — if so, the user needs an explicit grant
2. Verify the user's address is in `ADMINS` if they need full access
3. Use [document permissions](./02-DocumentPermissions.md) to grant the user access to the specific document
4. Verify wallet addresses are correctly formatted (full addresses, no typos)

### "401 Unauthorized" Error

**Problem**: Request is rejected before reaching authorization

**Solutions**:

1. User needs to authenticate: `ph login`
2. Generate valid bearer token: `ph access-token`
3. Include token in request header: `Authorization: Bearer <token>`
4. Check token hasn't expired

### Configuration Not Taking Effect

**Problem**: Changed configuration but nothing happens

**Solutions**:

1. Restart the Reactor after configuration changes
2. Check environment variables are set in the correct shell/environment
3. Verify `powerhouse.config.json` syntax is valid JSON
4. Environment variables override config file - check for conflicts

### How to Find a User's Ethereum Address

```bash
# User checks their own address
ph login --status
```

The address is shown in the authentication status output.

## Next Steps

- **Document Permissions**: Set up [fine-grained document permissions](./02-DocumentPermissions.md)
- **Authentication**: Learn about the [Renown authentication flow](./01-RenownAuthenticationFlow.md)
- **API Usage**: Explore [using the GraphQL API](../../04-WorkWithData/02-UsingTheAPI.mdx)
