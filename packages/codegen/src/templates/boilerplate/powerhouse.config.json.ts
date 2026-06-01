import { DEFAULT_REGISTRY_URL } from "@powerhousedao/shared/registry";
import { json } from "@tmpl/core";
function makeVetraConfigField(vetraDriveUrl: string | undefined) {
  if (!vetraDriveUrl) return "";
  const driveId = vetraDriveUrl.split("/").pop() ?? "";
  return json`
  ,
  "vetra": {
    "driveId": "${driveId}",
    "driveUrl": "${vetraDriveUrl}"
  }
`.raw;
}

export function buildPowerhouseConfigTemplate(args: {
  tag?: string;
  version?: string;
  remoteDrive?: string;
}): Promise<string> {
  const vetraConfigField = makeVetraConfigField(args.remoteDrive);
  return Promise.resolve(
    json`
  {
  "documentModelsDir": "./document-models",
  "editorsDir": "./editors",
  "processorsDir": "./processors",
  "subgraphsDir": "./subgraphs",
  "studio": {
    "port": 3000
  },
  "reactor": {
    "port": 4001
  },
  "packages": [
  ],
  "packageRegistryUrl": "${DEFAULT_REGISTRY_URL}"${vetraConfigField}
}
`.raw,
  );
}
