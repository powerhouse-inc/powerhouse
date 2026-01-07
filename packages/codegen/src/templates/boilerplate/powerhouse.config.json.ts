import { json } from "@tmpl/core";
import { getPackageVersion } from "../../file-builders/boilerplate/utils.js";

const vetraPackageTemplate = (packageVersion: string) =>
  json`
{
  "packageName": "@powerhousedao/vetra",
  "version": "${packageVersion}",
  "provider": "npm"
}
`.raw;

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

export async function buildPowerhouseConfigTemplate(
  tag: string | undefined,
  vetraDriveUrl: string | undefined,
) {
  const vetraPackageVersion = await getPackageVersion("@powerhousedao/vetra", {
    tag,
  });
  const vetraConfigField = makeVetraConfigField(vetraDriveUrl);
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
    ${vetraPackageTemplate(vetraPackageVersion)}
  ]${vetraConfigField}
}
`.raw;
}
