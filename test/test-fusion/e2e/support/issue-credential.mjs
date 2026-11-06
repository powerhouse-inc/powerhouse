// What renown.id does for a returning user, for the redirect sign-in e2e:
// sign a delegation credential for the app's key with the user's wallet, store
// it on the switchboard, and wait until the read model serves it back.
//
//   node issue-credential.mjs <switchboardUrl> <appName> <appDid> <privateKey> <chainId>
//
// A separate ESM process because Playwright loads specs as CommonJS, and the
// SDK's dependencies export some subpaths for `import` only.
import { buildAndSignCredential, SwitchboardClient } from "@renown/sdk";
import { privateKeyToAccount } from "viem/accounts";

const [switchboardUrl, app, appDid, privateKey, chainIdArg] =
  process.argv.slice(2);
const chainId = Number(chainIdArg);
const account = privateKeyToAccount(privateKey);
const switchboard = new SwitchboardClient(switchboardUrl);

const credential = await buildAndSignCredential({
  signTypedData: (args) => account.signTypedData(args),
  address: account.address,
  chainId,
  app,
  appId: appDid,
});
await switchboard.issueCredential(credential);

// The app reads the credential back from the read model, which indexes the
// write asynchronously. The real portal round trip outlasts that lag; this has
// to wait for it explicitly.
const deadline = Date.now() + 15_000;
for (;;) {
  const stored = await switchboard.getCredential({
    address: account.address,
    chainId,
    appDid,
  });
  if (stored) break;
  if (Date.now() > deadline) {
    console.error("credential never became readable");
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
console.log(`did:pkh:eip155:${chainId}:${account.address.toLowerCase()}`);
