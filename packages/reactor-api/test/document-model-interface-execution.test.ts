import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { defineDocumentModel, materialize, ph } from "document-model";
import { describe, expect, it } from "vitest";
import { withBlankStoredSdl } from "./utils/code-first-models.js";
import { hostFor, messages } from "./utils/document-model-host.js";

function reviewModel(union: boolean, discriminator: boolean) {
  const Named = ph.interface("Named", {
    fields: { label: ph.String({ required: true }) },
  });
  const Note = ph.object("Note", {
    implements: [Named],
    fields: {
      label: ph.String({ required: true }),
      body: ph.String({ required: true }),
    },
  });
  const Link = ph.object("Link", {
    implements: [Named],
    fields: {
      label: ph.String({ required: true }),
      href: ph.String({ required: true }),
    },
  });
  const Value = union ? ph.union("Value", { members: [Note, Link] }) : Named;
  const link = discriminator
    ? {
        __typename: "Link",
        label: "Link",
        body: "extra field",
        href: "https://example.com",
      }
    : { label: "Link", href: "https://example.com" };
  const review = defineDocumentModel({
    id: "test/interface-review",
    name: "InterfaceReview",
    description: "",
    extension: "review",
    version: 1,
    author: { name: "Powerhouse" },
    scopes: {
      global: {
        schema: ph.object("InterfaceReviewState", {
          fields: {
            values: ph.list(ph.ref(Value, { required: true }), {
              required: true,
            }),
            notes: ph.list(ph.ref(Note, { required: true }), {
              required: true,
            }),
            links: ph.list(ph.ref(Link, { required: true }), {
              required: true,
            }),
          },
        }),
        initialValue: {
          values: [{ label: "Note", body: "Hello" }, link],
          notes: [],
          links: [],
        },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const entries = review.module("entries", {
    operations: ({ global }) => ({
      noop: global({ input: ph.input({ fields: {} }), reduce() {} }),
    }),
  });
  return materialize(
    review.version({ modules: [entries] }),
  ) as unknown as DocumentModelModule;
}

const NOOP = `mutation { InterfaceReview { noop(documentIdOrSlug: "doc-1", input: {}) {
  state { global { values {
    __typename
    ... on InterfaceReview_Note { label body }
    ... on InterfaceReview_Link { label href }
  } } }
} } }`;

const RESOLVED = {
  InterfaceReview: {
    noop: {
      state: {
        global: {
          values: [
            {
              __typename: "InterfaceReview_Note",
              label: "Note",
              body: "Hello",
            },
            {
              __typename: "InterfaceReview_Link",
              label: "Link",
              href: "https://example.com",
            },
          ],
        },
      },
    },
  },
};

describe.each([
  ["an interface", false],
  ["a union", true],
])("state that holds %s", (_kind, union) => {
  it.each([false, true])(
    "resolves each member from the definition when the stored SDL is blank (discriminator: %s)",
    async (discriminator) => {
      const model = withBlankStoredSdl(reviewModel(union, discriminator));
      const result = await hostFor(model).run(NOOP);
      expect(messages(result)).toEqual([]);
      expect(result.data).toEqual(RESOLVED);
    },
  );
});
