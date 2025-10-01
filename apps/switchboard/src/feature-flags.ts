import { EnvVarProvider } from "@openfeature/env-var-provider";
import { OpenFeature } from "@openfeature/server-sdk";

export async function initFeatureFlags() {
  // for now, we're only using env vars for feature flags
  const provider = new EnvVarProvider();

  await OpenFeature.setProviderAndWait(provider);

  return OpenFeature.getClient();
}

export async function isReactorv2Enabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return await client.getBooleanValue("FEATURE_REACTORV2_ENABLED", false);
}

export async function isDualActionCreateEnabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  return await client.getBooleanValue("FEATURE_DUAL_ACTION_CREATE_ENABLED", false);
}
