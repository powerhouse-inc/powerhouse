import { OpenFeature } from "@openfeature/server-sdk";
import { EnvVarProvider } from "@openfeature/env-var-provider";

export async function initFeatureFlags() {
  const provider = new EnvVarProvider();

  await OpenFeature.setProviderAndWait(provider);

  return OpenFeature.getClient();
}

export async function isReactorv2Enabled(): Promise<boolean> {
  const client = OpenFeature.getClient();
  // EnvVarProvider will read from FEATURE_REACTORV2_ENABLED env variable
  const flag = await client.getBooleanValue("FEATURE_REACTORV2_ENABLED", false);
  return flag;
}
