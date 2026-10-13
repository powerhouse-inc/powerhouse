import {
  defineDocumentModel,
  ph,
  type DocumentModelModule,
} from "document-model";
import { describe, expect, it } from "vitest";
import { asSchemaFirst, hostFor } from "./utils/graphql-host.js";

function model(union: boolean, discriminator: boolean) {
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
  const context = defineDocumentModel({
    id: "test/interface-review",
    name: "InterfaceReview",
    description: "",
    extension: "review",
    version: 1,
    author: { name: "Test", website: null },
    specifications: {
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
  const entries = context.module("entries", {
    operations: ({ global }) => ({
      noop: global({ input: ph.input({ fields: {} }), reduce() {} }),
    }),
  });
  return context.finalize({ modules: [entries] });
}

describe.each([false, true])(
  "document model abstract execution (union: %s)",
  (union) => {
    it.each([
      { stored: false, discriminator: false },
      { stored: true, discriminator: false },
      { stored: false, discriminator: true },
      { stored: true, discriminator: true },
    ])(
      "resolves objects (stored: $stored, discriminator: $discriminator)",
      async ({ stored, discriminator }) => {
        const compiled = model(
          union,
          discriminator,
        ) as unknown as DocumentModelModule;
        const host = hostFor(stored ? asSchemaFirst(compiled) : compiled);
        const result = await host.run(`mutation {
      InterfaceReview { noop(documentIdOrSlug: "doc-1", input: {}) {
        state { global { values {
          __typename
          ... on InterfaceReview_Note { label body }
          ... on InterfaceReview_Link { label href }
        } } }
      } }
    }`);
        expect(result.errors).toBeUndefined();
        expect(result.data).toMatchObject({
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
        });
      },
    );
  },
);
