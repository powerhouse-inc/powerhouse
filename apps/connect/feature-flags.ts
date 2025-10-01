export async function initFeatureFlags() {}

export async function isReactorv2Enabled(): Promise<boolean> {
  //const client = OpenFeature.getClient();
  //return await client.getBooleanValue("FEATURE_REACTORV2_ENABLED", false);
  return false;
}

export async function isDualActionCreateEnabled(): Promise<boolean> {
  //const client = OpenFeature.getClient();
  //return await client.getBooleanValue(
  //"FEATURE_DUAL_ACTION_CREATE_ENABLED",
  //false,
  //);
  return false;
}
