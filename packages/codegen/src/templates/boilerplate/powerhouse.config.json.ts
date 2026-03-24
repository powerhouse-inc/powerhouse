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

export async function buildPowerhouseConfigTemplate(args: {
  tag?: string;
  version?: string;
  remoteDrive?: string;
}) {
  const vetraConfigField = makeVetraConfigField(args.remoteDrive);
  return json`
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
  ]${vetraConfigField}
}
`.raw;
}
