import { json } from "@tmpl/core";

export const ManifestTemplate = (projectName: string) =>
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
