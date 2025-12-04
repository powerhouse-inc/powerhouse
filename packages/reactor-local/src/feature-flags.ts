import { EnvVarProvider } from "@openfeature/env-var-provider";
import { OpenFeature } from "@openfeature/server-sdk";

export async function initFeatureFlags() {
  // for now, we're only using env vars for feature flags
  const provider = new EnvVarProvider();

  await OpenFeature.setProviderAndWait(provider);

  return OpenFeature.getClient();
}
