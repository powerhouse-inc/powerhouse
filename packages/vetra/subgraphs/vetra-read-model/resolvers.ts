import type { ISubgraph } from "@powerhousedao/reactor-api";
import { VetraReadModelProcessorLegacy } from "../../processors/vetra-read-model/index.legacy.js";
import type { DB } from "../../processors/vetra-read-model/schema.js";

export const getResolvers = (subgraph: ISubgraph): Record<string, unknown> => {
  const db = subgraph.relationalDb;

  return {
    Query: {
      vetraPackages: async (
        parent: unknown,
        args: {
          search?: string;
          sortOrder?: "asc" | "desc";
          documentId_in?: string[];
        },
      ) => {
        const { search, documentId_in } = args;
        const sortOrder = args.sortOrder || "asc";

        let query = VetraReadModelProcessorLegacy.query<DB>(
          "vetra-packages",
          db,
        )
          .selectFrom("vetra_package")
          .selectAll();

        if (search) {
          query = query.where("name", "ilike", `%${search}%`);
        }

        if (documentId_in && documentId_in.length > 0) {
          query = query.where("document_id", "in", documentId_in);
        }

        query = query.orderBy("name", sortOrder);

        return (await query.execute()).map((pkg) => ({
          ...pkg,
          documentId: pkg.document_id,
          name: pkg.name,
          description: pkg.description,
          category: pkg.category,
          authorName: pkg.author_name,
          authorWebsite: pkg.author_website,
          githubUrl: pkg.github_url,
          npmUrl: pkg.npm_url,
          keywords: pkg.keywords,
          driveId: pkg.drive_id,
        }));
      },
    },
  };
};
