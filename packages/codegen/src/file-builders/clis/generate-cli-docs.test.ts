import { describe, expect, it } from "vitest";
import { makeCliDocsFromHelp } from "./generate-cli-docs.js";

describe("the CLI docs from help", () => {
  it("keeps the colon of a URL default, and names the variable", () => {
    const docs = makeCliDocsFromHelp({
      cliDescription: "A CLI.",
      docsTitle: "Commands",
      docsIntroduction: "The commands.",
      entries: [
        {
          name: "token create",
          command: {
            description: "Makes a token.",
            helpTopics: () => [
              {
                category: "options",
                usage: "--renown-url <str>",
                description: "The Renown to ask.",
                defaults: [
                  "optional",
                  "env: PH_CONNECT_RENOWN_URL",
                  "default: https://renown-staging.vetra.io",
                ],
              },
            ],
          },
        },
      ],
    });
    expect(docs).toContain(
      "**env**: `PH_CONNECT_RENOWN_URL`<br>**default**: `https://renown-staging.vetra.io`",
    );
    expect(docs).not.toContain("https//");
  });
});
