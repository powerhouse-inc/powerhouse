import { formatFiles, generateFiles, Tree } from "@nx/devkit";
import * as path from "path";
import { NewScalarGeneratorSchema } from "./schema";

const namespaceImport =
  "// namespace imports -- DO NOT REMOVE OR EDIT THIS COMMENT";
const exportObject = "// export object -- DO NOT REMOVE OR EDIT THIS COMMENT";
const exportResolvers =
  "// export resolvers -- DO NOT REMOVE OR EDIT THIS COMMENT";
const exportTypedefs =
  "// export typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT";

const exportScalarType =
  "// export types -- DO NOT REMOVE OR EDIT THIS COMMENT";

const exportGeneratorTypeDefs =
  "// export generator typedefs -- DO NOT REMOVE OR EDIT THIS COMMENT";

const exportValidationSchema =
  "// export validation schema -- DO NOT REMOVE OR EDIT THIS COMMENT";

export async function newScalarGenerator(
  tree: Tree,
  options: NewScalarGeneratorSchema,
) {
  const projectRoot = `packages/scalars`;

  generateFiles(tree, path.join(__dirname, "files"), projectRoot, options);

  const filePath = `packages/scalars/src/scalars/index.ts`;
  const contents = tree.read(filePath)?.toString() || "";

  let newContents = contents.replace(
    namespaceImport,
    `${namespaceImport}\nimport * as ${options.name} from './${options.name}.js';`,
  );

  newContents = newContents.replace(
    exportObject,
    `${exportObject}\n    ${options.name},`,
  );

  newContents = newContents.replace(
    exportResolvers,
    `${exportResolvers}\n    ${options.name}: ${options.name}.scalar,`,
  );

  newContents = newContents.replace(
    exportTypedefs,
    `${exportTypedefs}\n    ${options.name}.typedef,`,
  );

  newContents = newContents.replace(
    exportScalarType,
    `${exportScalarType}\nexport type { ScalarType as ${options.name}ScalarType } from './${options.name}.js';`,
  );

  newContents = newContents.replace(
    exportGeneratorTypeDefs,
    `${exportGeneratorTypeDefs}\n    [${options.name}.config.name]: ${options.name}.type,`,
  );

  newContents = newContents.replace(
    exportValidationSchema,
    `${exportValidationSchema}\n    [${options.name}.config.name]: ${options.name}.stringSchema,`,
  );

  tree.write(filePath, newContents);

  await formatFiles(tree);
}

export default newScalarGenerator;
