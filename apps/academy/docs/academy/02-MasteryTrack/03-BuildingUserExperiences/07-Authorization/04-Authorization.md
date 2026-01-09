# Reactor API Authorization

This guide explains how to configure **global role-based authorization** for the Powerhouse Reactor API. This is the first layer of access control that determines who can access your Reactor at all.

## Introduction

The **Reactor API** is the API interface to a Powerhouse **Reactor**—a storage node responsible for storing documents, resolving conflicts, and verifying document event histories. Before users can interact with documents in your Reactor, they must pass through authorization checks.

### Two Layers of Authorization

The Reactor API implements a two-layer authorization system:

| Layer | System | Purpose | Scope |
|-------|--------|---------|-------|
| **Layer 1** | **Global Role-Based Authorization** (this guide) | Controls who can access the Reactor API | Reactor-wide |
| **Layer 2** | [Document Permission System](./02-DocumentPermissions.md) | Controls access to specific documents/folders/drives | Per-document |

**Think of it like a building:**
- **Global roles** (this guide) = Front door access - determines who can enter the building
- **Document permissions** = Room keys - determines which rooms you can access once inside

:::tip Which system should I use?
- Use **global roles** (this guide) for simple setups where all authenticated users should have similar access
- Add **[document permissions](./02-DocumentPermissions.md)** when you need fine-grained control over specific documents, folders, or drives
:::

## Prerequisites

Before configuring authorization, you need:

1. **A running Reactor**: See [Document Permissions - Starting the Reactor API](./02-DocumentPermissions.md#starting-the-reactor-api) for setup instructions
2. **User Ethereum addresses**: Addresses of users you want to grant access to

## Basic Configuration

The Reactor API supports two main ways to configure authorization:

1. Using environment variables
2. Using the powerhouse configuration file

### Environment Variables

Configure authorization using environment variables before starting the Reactor:

```bash
# Required: Enable/disable authentication
AUTH_ENABLED=true

# Optional: Comma-separated list of admin wallet addresses (full access)
ADMINS="0x123...,0x456..."

# Optional: Comma-separated list of regular user wallet addresses (standard access)
USERS="0xdef...,0xghi..."

# Optional: Comma-separated list of guest wallet addresses (read-only)
GUESTS="0x789...,0xabc..."

# Optional: Allow any authenticated user to access the Reactor
FREE_ENTRY=true
```

**Important notes:**
- Use full Ethereum addresses (e.g., `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`)
- **FREE_ENTRY=true**: When enabled, any user with a valid Renown credential can access the Reactor as a USER
- **FREE_ENTRY=false** (default): Only addresses in ADMINS, USERS, or GUESTS lists can access
- If `AUTH_ENABLED=false`, all authorization checks are bypassed (not recommended for production)

### Powerhouse configuration

Alternatively, you can configure authorization in your `powerhouse.config.json`:

```json
{
  "auth": {
    "enabled": true,
    "guests": ["0x789", "0xabc"],
    "users": ["0xdef", "0xghi"],
    "admins": ["0x123", "0x456"]
  }
}
```

## Role-Based Access Control

The global authorization system implements three distinct roles, each with different access levels:

### Role Definitions

| Role | Access Level | Typical Use Case |
|------|-------------|------------------|
| **GUEST** | Read-only | External stakeholders who need to view data |
| **USER** | Standard operations | Regular contributors who create and edit documents |
| **ADMIN** | Full access | System administrators who manage the Reactor |

### Role Details

#### 1. Guests (GUESTS)
- **Access**: Limited, read-only access to specific endpoints
- **Can**: View public data, read documents they have permission for
- **Cannot**: Perform write operations, create drives
- **Example**: External auditors viewing budget documents

#### 2. Users (USERS)  
- **Access**: Standard access to most endpoints
- **Can**: Create and edit documents, perform regular operations
- **Cannot**: Access administrative functions, manage global settings
- **Example**: Team members collaborating on projects

#### 3. Admins (ADMINS)
- **Access**: Full access to all endpoints and operations
- **Can**: Manage drives, configure the Reactor, grant permissions
- **Cannot**: Nothing - full access
- **Example**: System administrators, project owners

:::info Global Roles vs Document Permissions
These global roles grant **baseline access** to the Reactor API. To control access to specific documents:
1. Users must first have a global role (GUEST, USER, or ADMIN)
2. Then apply [document-level permissions](./02-DocumentPermissions.md) for fine-grained control

**Example**: A USER role can access the API, but document permissions determine if they can read/write specific documents.
:::

## Docker configuration

When running the Reactor API in Docker, you can pass these configurations as environment variables:

```bash
docker run -e AUTH_ENABLED=true \
           -e GUESTS="0x789,0xabc" \
           -e USERS="0xdef,0xghi" \
           -e ADMINS="0x123,0x456" \
           your-Reactor API-image
```

## Authorization Flow

Understanding how authorization checks work:

```
User makes API request
     ↓
Is AUTH_ENABLED=true?
     ├─ No → Access granted (no auth required)
     └─ Yes → Continue to role check
          ↓
Does user have valid bearer token?
     ├─ No → 401 Unauthorized
     └─ Yes → Extract Ethereum address from token
          ↓
Is user's address in ADMINS, USERS, or GUESTS?
     ├─ Yes → Grant role-specific access
     └─ No → Check FREE_ENTRY
          ↓
Is FREE_ENTRY=true?
     ├─ Yes → Grant USER access
     └─ No → 403 Forbidden


### Step-by-Step

1. **Authentication check**: If `AUTH_ENABLED=false`, all requests are allowed (skip remaining steps)
2. **Token validation**: User must include valid bearer token from `ph access-token`
3. **Role assignment**: User's Ethereum address is checked against ADMINS, USERS, GUESTS lists
4. **Free entry fallback**: If not in any list but `FREE_ENTRY=true`, grant USER role
5. **Document permissions** (if enabled): After passing global auth, check [document-level permissions](./02-DocumentPermissions.md)

:::tip Authentication vs Authorization
- **Authentication** ([Renown flow](./01-RenownAuthenticationFlow.md)): Proves who you are (`ph login`)
- **Authorization** (this guide): Determines what you can access (role-based)
:::

## Common Scenarios

### Scenario 1: Open Development Environment

You want a local Reactor where anyone can access everything:

```bash
AUTH_ENABLED=false
```

**Use case**: Local development, testing, demos

### Scenario 2: Restricted Production Environment

Only specific team members can access:

```bash
AUTH_ENABLED=true
FREE_ENTRY=false
ADMINS="0xProjectLead"
USERS="0xDev1,0xDev2,0xDev3"
GUESTS="0xClient,0xAuditor"
```

**Use case**: Private team workspace, sensitive data

### Scenario 3: Open Collaboration with Permissions

Any authenticated user can access, but document permissions control specifics:

```bash
AUTH_ENABLED=true
FREE_ENTRY=true
DOCUMENT_PERMISSIONS_ENABLED=true
ADMINS="0xProjectLead"
```

**Use case**: Open source projects, community collaboration

Then use [document permissions](./02-DocumentPermissions.md) to control who can read/write specific documents.

## Security Best Practices

1. **Secure admin addresses**: Keep admin wallet private keys secure
2. **Use HTTPS in production**: Never expose the Reactor API over plain HTTP
3. **Regular access audits**: Review and update role assignments periodically
4. **Development vs Production**: Use `AUTH_ENABLED=false` only in local development
5. **Principle of least privilege**: Start users as GUESTS, elevate only when needed
6. **Combine with document permissions**: For production, use both layers of authorization

## Troubleshooting

Common issues and solutions:

### "403 Forbidden" Error

**Problem**: User has valid token but cannot access the Reactor

**Solutions**:
1. Verify user's Ethereum address is in ADMINS, USERS, or GUESTS lists
2. Check if `FREE_ENTRY=true` is set (allows any authenticated user)
3. Confirm `AUTH_ENABLED=true` is set correctly
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

- **Layer 2 Authorization**: Set up [fine-grained document permissions](./02-DocumentPermissions.md)
- **Authentication**: Learn about the [Renown authentication flow](./01-RenownAuthenticationFlow.md)
- **API Usage**: Explore [using the GraphQL API](../../04-WorkWithData/02-UsingTheAPI.mdx)
