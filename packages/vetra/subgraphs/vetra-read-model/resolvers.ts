import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { VetraReadModelProcessor } from "../../processors/vetra-read-model/index.js";
import type { DB } from "../../processors/vetra-read-model/schema.js";
import { canReadDocument, hasGlobalReadAccess } from "../permission-utils.js";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactor;
  const db = subgraph.relationalDb;

  return {
    Query: {
      vetraPackages: async (
        _parent: unknown,
        args: {
          search?: string;
          sortOrder?: "asc" | "desc";
          documentId_in?: string[];
        },
        ctx: Context,
      ) => {
        const { search, documentId_in } = args;
        const sortOrder = args.sortOrder || "asc";

        let query = VetraReadModelProcessor.query<DB>("vetra-packages", db)
          .selectFrom("vetra_package")
          .selectAll();

        if (search) {
          query = query.where("name", "ilike", `%${search}%`);
        }

        if (documentId_in && documentId_in.length > 0) {
          query = query.where("document_id", "in", documentId_in);
        }

        query = query.orderBy("name", sortOrder);

        const results = await query.execute();

        const mappedResults = results.map((pkg) => ({
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

        // If user doesn't have global read access, filter by document-level permissions
        if (!hasGlobalReadAccess(ctx) && subgraph.documentPermissionService) {
          const filteredResults = [];
          for (const pkg of mappedResults) {
            const canRead = await canReadDocument(
              subgraph,
              pkg.documentId,
              ctx,
            );
            if (canRead) {
              filteredResults.push(pkg);
            }
          }
          return filteredResults;
        }

        return mappedResults;
      },
    },
  };
};
