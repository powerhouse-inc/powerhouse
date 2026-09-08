#!/usr/bin/env node
import {
  getScalarCatalogConformanceEntries,
  inspectScalarCatalogConformance,
} from "document-model/tooling";
import { digestJson } from "../src/evidence/model-parity.js";

const catalog = inspectScalarCatalogConformance();
process.stdout.write(
  `${digestJson({
    names: catalog.names,
    validationProfiles: catalog.validationProfiles,
    graphQLProfiles: catalog.graphQLProfiles,
    catalogDigest: catalog.catalogDigest,
    definitions: getScalarCatalogConformanceEntries().map(
      ({ definition }) => definition,
    ),
  })}\n`,
);
