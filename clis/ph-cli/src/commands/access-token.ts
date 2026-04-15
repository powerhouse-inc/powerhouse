import {
  accessTokenArgs,
  DEFAULT_EXPIRY_SECONDS,
} from "@powerhousedao/shared/clis";
import { command } from "cmd-ts";

export const accessToken = command({
  name: "access-token",
  description: `
The access-token command generates a bearer token for API authentication. This token
can be used to authenticate requests to Powerhouse APIs like reactor-api (Switchboard).

This command:
1. Uses your CLI's cryptographic identity (DID) to sign a verifiable credential
2. Creates a JWT bearer token with configurable expiration
3. Outputs the token to stdout (info to stderr) for easy piping

Prerequisites:
  You must have a cryptographic identity. Run 'ph login' first to:
  - Generate a keypair (stored in .ph/.keypair.json)
  - Optionally link your Ethereum address (stored in .ph/.renown.json)

Token Details:
  The generated token is a JWT (JSON Web Token) containing:
  - Issuer (iss): Your CLI's DID (did:key:...)
  - Subject (sub): Your CLI's DID
  - Credential Subject: Chain ID, network ID, and address (if authenticated)
  - Expiration (exp): Based on --expiry option
  - Audience (aud): If --audience is specified

Output:
- Token information (DID, address, expiry) is printed to stderr
- The token itself is printed to stdout for easy piping/copying

This allows you to use the command in scripts:
  TOKEN=$(ph access-token)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/graphql

Usage with APIs:
  Generate token and use with curl
  TOKEN=$(ph access-token --expiry 1d)
  curl -X POST http://localhost:4001/graphql \\
    -H "Content-Type: application/json" \\
    -H "Authorization: Bearer $TOKEN" \\
    -d '{"query": "{ drives { id name } }"}'

  Export as environment variable
  export PH_ACCESS_TOKEN=$(ph access-token)

Notes:
  - Tokens are self-signed using your CLI's private key
  - No network request is made; tokens are generated locally
  - The recipient API must trust your CLI's DID to accept the token
  - For reactor-api, ensure AUTH_ENABLED=true to require authentication
`,
  args: accessTokenArgs,
  handler: async (args) => {
    if (args.debug) {
      console.log(args);
    }

    const { generateAccessToken, parseExpiry, formatExpiry } =
      await import("@renown/sdk/node");
    const { getRenown } = await import("../services/auth.js");
    const renown = await getRenown();

    let expiresIn = DEFAULT_EXPIRY_SECONDS;
    if (args.expiry) expiresIn = parseExpiry(args.expiry);

    const result = await generateAccessToken(renown, {
      expiresIn,
      aud: args.audience,
    });

    // Output token info to stderr, token itself to stdout for piping
    console.error(`CLI DID: ${result.did}`);
    console.error(`ETH Address: ${result.address}`);
    console.error(`Token expires in: ${formatExpiry(expiresIn)}`);
    console.error("");

    console.log(result.token);
    process.exit(0);
  },
});
