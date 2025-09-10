# Reactor API Authorization

This tutorial explains how to configure authorization for the Powerhouse Reactor API using the new role-based authentication system.

## Basic configuration

The Reactor API supports two main ways to configure authorization:

1. Using environment variables
2. Using the powerhouse configuration file

### Environment variables

The following environment variables can be used to configure authorization:

```bash
# Required: Enable/disable authentication
AUTH_ENABLED=true

# Optional: Comma-separated list of guest wallet addresses
GUESTS="0x789,0xabc"

# Optional: Comma-separated list of regular user wallet addresses
USERS="0xdef,0xghi"

# Optional: Comma-separated list of admin wallet addresses
ADMINS="0x123,0x456"
```

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

## Role-based access control

The new authorization system implements role-based access control with three distinct roles:

1. **Guests (GUESTS)**
   - Limited access to specific endpoints
   - Can view public data
   - Cannot perform write operations

2. **Users (USERS)**
   - Standard access to most endpoints
   - Can perform regular operations
   - Cannot access administrative functions

3. **Admins (ADMINS)**
   - Full access to all endpoints
   - Can manage drives
   - Can perform administrative tasks

## Docker configuration

When running the Reactor API in Docker, you can pass these configurations as environment variables:

```bash
docker run -e AUTH_ENABLED=true \
           -e GUESTS="0x789,0xabc" \
           -e USERS="0xdef,0xghi" \
           -e ADMINS="0x123,0x456" \
           your-Reactor API-image
```

## Authorization flow

1. Authentication can be enabled/disabled using AUTH_ENABLED
2. Users are assigned roles based on their wallet addresses
3. Each role has specific permissions and access levels

## Security best practices

1. Keep your admin wallet addresses secure
2. Use HTTPS in production environments
3. Review and update role assignments regularly
4. Consider using AUTH_ENABLED=false only in development

## Troubleshooting

If you encounter authorization issues:

1. Check that AUTH_ENABLED is set appropriately
2. Verify wallet addresses are correctly formatted in their respective roles
3. Check the Reactor API logs for detailed error messages
4. Verify that your database and Redis connections are working
5. Confirm that users are assigned to the correct roles
