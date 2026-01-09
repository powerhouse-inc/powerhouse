import { json } from "@tmpl/core";

export const powerhouseManifestTemplate = (projectName: string) =>
  json`
{
    "name": "${projectName}",
    "description": "",
    "category": "",
    "publisher": {
        "name": "",
        "url": ""
    },
    "documentModels": [],
    "editors": [],
    "apps": [],
    "subgraphs": [],
    "importScripts": []
}

`.raw;
