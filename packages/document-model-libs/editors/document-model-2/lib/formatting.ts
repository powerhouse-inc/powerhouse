import prettier from "prettier/standalone";
import prettierPluginGraphql from "prettier/plugins/graphql";

export async function formatGraphql(doc: string) {
  try {
    const result = await prettier.format(doc, {
      parser: "graphql",
      plugins: [prettierPluginGraphql],
    });
    return result;
  } catch (e) {
    return doc;
  }
}

export async function formatTypescript(doc: string) {
  try {
    const result = await prettier.format(doc);
    return result;
  } catch (e) {
    return doc;
  }
}
