# Powerhouse Authentication System Tutorial

## Overview

The Powerhouse authentication system is a sophisticated, decentralized identity and authorization solution that combines blockchain-based authentication with role-based access control. It provides secure, verifiable, and privacy-preserving authentication for decentralized applications while maintaining the flexibility of traditional role-based systems.

## What It's Capable Of

### 🔐 **Decentralized Identity Management**
- **DID (Decentralized Identifier) Creation**: Generates unique, self-sovereign identifiers based on Ethereum addresses
- **Verifiable Credentials**: Uses W3C Verifiable Credentials standard for cryptographic proof of identity
- **Wallet Integration**: Seamless integration with Ethereum wallets and other Web3 providers
- **Privacy Preservation**: Users can maintain pseudonymous identities while building reputation

### 🎭 **Role-Based Access Control (RBAC)**
- **Three-Tier System**: Guests, Users, and Admins with different permission levels
- **Flexible Configuration**: Easy setup through environment variables or configuration files
- **Granular Permissions**: Fine-grained control over what each role can access
- **Dynamic Role Assignment**: Roles can be updated without restarting the system

### 🔒 **Advanced Security Features**
- **Challenge-Response Authentication**: Cryptographic proof of wallet ownership
- **JWT Token Management**: Secure session handling with automatic expiration
- **Credential Verification**: Real-time validation against the Renown API
- **Token Caching**: Performance optimization with secure token storage
- **Session Management**: Multiple active sessions with individual controls

### 🌐 **Cross-Platform Compatibility**
- **GraphQL Integration**: Native GraphQL support with authentication middleware
- **REST API Support**: Standard HTTP authentication headers
- **Multi-Origin Support**: Configurable CORS and origin restrictions
- **Mobile & Desktop**: Works across all platforms and devices

## How It Works Under the Hood

### 1. **Authentication Flow Architecture**

```
User Wallet → Challenge Request → Signature → Token Generation → Session Creation
     ↓              ↓              ↓            ↓              ↓
  Ethereum    Nonce + Message   Signed      JWT Token     Active Session
  Address     (Cryptographic)   Message     (Verifiable)  (Authorized)
```

### 2. **Decentralized Identity Creation**

The system uses the **Renown** service to create and manage decentralized identities:

```typescript
// DID Format: did:pkh:eip155:1:0x1234...
interface PKHDid {
  networkId: string;    // Network identifier (e.g., "mainnet")
  chainId: number;      // Blockchain chain ID (e.g., 1 for Ethereum mainnet)
  address: `0x${string}`; // Ethereum wallet address
}
```

**Key Benefits:**
- **Self-Sovereign**: Users control their own identity without central authority
- **Portable**: Identity can be used across different applications
- **Verifiable**: Cryptographic proof of ownership and authenticity
- **Privacy-Preserving**: No personal information required

### 3. **Challenge-Response Authentication**

Instead of traditional username/password, the system uses cryptographic challenges:

```typescript
// Step 1: Create Challenge
const challenge = await createChallenge(userAddress);
// Returns: { nonce: "random-string", message: "Sign this message: ..." }

// Step 2: User Signs Message
const signature = await signMessage(challenge.message);

// Step 3: Verify Signature
const token = await solveChallenge(challenge.nonce, signature);
```

**Security Features:**
- **Nonce-based**: Prevents replay attacks
- **Cryptographic Proof**: Verifies wallet ownership
- **Time-limited**: Challenges expire quickly
- **Unique per Session**: Each login uses a different challenge

### 4. **Verifiable Credentials System**

The system leverages W3C Verifiable Credentials for identity verification:

```typescript
interface VerifiableCredential {
  "@context": ["https://www.w3.org/2018/credentials/v1"];
  type: ["VerifiableCredential"];
  credentialSubject: {
    chainId: number;
    networkId: string;
    address: string;
  };
  issuer: string;        // DID of the credential issuer
  issuanceDate: string;  // When credential was created
  proof: object;         // Cryptographic proof of authenticity
}
```

**Verification Process:**
1. **Token Decoding**: Extract credential information from JWT
2. **Credential Validation**: Verify against W3C standards
3. **Issuer Verification**: Check credential issuer authenticity
4. **Renown API Check**: Validate credential still exists and is valid
5. **User Extraction**: Create user object from verified credentials

### 5. **Role-Based Authorization**

The system implements a three-tier role system with configurable permissions:

```typescript
interface AuthConfig {
  enabled: boolean;
  guests: string[];    // Array of wallet addresses
  users: string[];     // Array of wallet addresses  
  admins: string[];    // Array of wallet addresses
}
```

**Permission Levels:**
- **Guests**: Read-only access to public data
- **Users**: Standard access to most endpoints and operations
- **Admins**: Full access including administrative functions

### 6. **Session Management**

Advanced session handling with multiple active sessions:

```typescript
interface Session {
  id: string;
  createdAt: Date;
  createdBy: string;
  referenceExpiryDate?: Date;
  referenceTokenId?: string;
  isUserCreated?: boolean;
  name?: string;
  revokedAt?: Date;
  allowedOrigins?: string;
}
```

**Session Features:**
- **Multiple Sessions**: Users can have several active sessions
- **Custom Names**: Human-readable session identifiers
- **Expiration Control**: Configurable session lifetimes
- **Origin Restrictions**: Limit where sessions can be used
- **Revocation**: Immediate session termination capability

## How to Use the Authentication System

### 1. **Basic Configuration**

#### Environment Variables Method
```bash
# Enable authentication
export AUTH_ENABLED=true

# Configure roles (comma-separated wallet addresses)
export GUESTS="0x789,0xabc,0xdef"
export USERS="0x123,0x456,0x789"
export ADMINS="0x111,0x222,0x333"
```

#### Configuration File Method
```json
{
  "auth": {
    "enabled": true,
    "guests": ["0x789", "0xabc", "0xdef"],
    "users": ["0x123", "0x456", "0x789"],
    "admins": ["0x111", "0x222", "0x333"]
  }
}
```

### 2. **Frontend Integration**

#### Using the useAuth Hook
```typescript
import useAuth from '../hooks/useAuth';

function LoginComponent() {
  const { signIn, signOut, isAuthorized, address } = useAuth();

  if (!isAuthorized) {
    return (
      <button 
        onClick={signIn}
        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded"
      >
        Sign in with Ethereum
      </button>
    );
  }

  return (
    <div>
      <p>Welcome, {address}</p>
      <button onClick={signOut}>Sign Out</button>
    </div>
  );
}
```

#### Session Management
```typescript
const { createSession, revokeSession, sessions } = useAuth();

// Create a new session
const token = await createSession(
  "My API Token",           // Session name
  3600,                     // Expiry in seconds (1 hour)
  "https://myapp.com"       // Allowed origin
);

// Revoke a session
await revokeSession(sessionId);
```

### 3. **Backend Integration**

#### Express Middleware Setup
```typescript
import { AuthService } from '@powerhousedao/reactor-api';

const authService = new AuthService({
  enabled: true,
  guests: ['0x789', '0xabc'],
  users: ['0x123', '0x456'],
  admins: ['0x111', '0x222']
});

// Apply to all routes
app.use(async (req, res, next) => {
  await authService.authenticate(req, res, next);
});

// Access user info in route handlers
app.post('/api/data', (req, res) => {
  const user = req.user;        // Authenticated user object
  const isAdmin = req.admins.includes(user.address);
  
  if (isAdmin) {
    // Admin-only operations
  }
});
```

#### GraphQL Context Integration
```typescript
const graphqlManager = new GraphQLManager(/* config */);

// Add auth context fields
graphqlManager.setAdditionalContextFields(
  authService.getAdditionalContextFields()
);
```

### 4. **API Authentication**

#### HTTP Headers
```bash
# Include JWT token in Authorization header
curl -H "Authorization: Bearer <your-jwt-token>" \
     https://api.example.com/data
```

#### GraphQL Queries
```typescript
// Apollo Client with auth link
const authLink = setContext((_, { headers }) => ({
  headers: {
    ...headers,
    authorization: token ? `Bearer ${token}` : "",
  },
}));

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
});
```

### 5. **Advanced Features**

#### Custom Session Creation
```typescript
// Create a long-lived API token
const apiToken = await createSession(
  "API Integration Token",
  86400 * 30,  // 30 days
  "*"          // Allow all origins
);

// Create a restricted session
const restrictedToken = await createSession(
  "Mobile App Token",
  86400 * 7,   // 7 days
  "https://mobile.myapp.com"  // Restrict to mobile app
);
```

#### Role-Based Route Protection
```typescript
// Middleware for admin-only routes
const requireAdmin = (req, res, next) => {
  if (!req.admins.includes(req.user.address)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

app.post('/admin/users', requireAdmin, (req, res) => {
  // Admin-only user management
});
```

## Security Considerations

### 🔒 **Best Practices**

1. **Token Storage**: Store tokens securely (localStorage for web, secure storage for mobile)
2. **Session Expiry**: Set reasonable expiration times for different use cases
3. **Origin Restrictions**: Limit session usage to specific domains when possible
4. **Regular Rotation**: Encourage users to rotate their sessions periodically
5. **Revocation**: Provide easy ways for users to revoke compromised sessions

### 🚨 **Security Features**

- **Automatic Expiration**: Sessions automatically expire based on configuration
- **Immediate Revocation**: Sessions can be revoked instantly if compromised
- **Credential Validation**: Real-time verification against the Renown API
- **Cryptographic Proof**: All authentication uses cryptographic signatures
- **No Password Storage**: No passwords to compromise or leak

## Troubleshooting

### Common Issues

1. **"Missing authorization token"**
   - Ensure the Authorization header is included
   - Check that the token format is `Bearer <token>`

2. **"Verification failed"**
   - Token may be expired or malformed
   - Check token validity and renewal

3. **"Credentials no longer valid"**
   - User's Renown credentials may have been revoked
   - Re-authenticate through the wallet connection

4. **"Forbidden"**
   - User's wallet address not in allowed roles
   - Check role configuration and user permissions

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
// Enable verbose logging
const authService = new AuthService({
  enabled: true,
  debug: true,  // Enable debug logging
  // ... other config
});
```

## Performance Optimization

### Caching Strategies

- **Token Caching**: Frequently used tokens are cached in memory
- **Credential Validation**: Results are cached to reduce API calls
- **Session Lookup**: Fast session validation using indexed lookups

### Scalability Features

- **Stateless Design**: No server-side session storage required
- **Distributed Validation**: Credentials can be verified across multiple nodes
- **Efficient Lookups**: O(1) role checking using Set data structures

## Conclusion

The Powerhouse authentication system provides a robust, secure, and flexible foundation for decentralized applications. By combining blockchain-based identity with traditional role-based access control, it offers the best of both worlds: the security and privacy of Web3 with the familiarity and flexibility of enterprise authentication systems.

Whether you're building a simple web app or a complex enterprise system, the authentication system scales to meet your needs while maintaining the highest security standards. The decentralized nature ensures user privacy and control, while the role-based system provides the administrative oversight needed for production applications.

For more information and advanced usage examples, refer to the Powerhouse documentation and community resources.

