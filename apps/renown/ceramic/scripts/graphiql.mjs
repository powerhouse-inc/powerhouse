import { serveEncodedDefinition } from "@composedb/devtools-node";

const CERAMIC_NODE_URL = process.env.CERAMIC_NODE_URL;
if (!CERAMIC_NODE_URL) {
    throw new Error("CERAMIC_NODE_URL is not set");
}

/**
 * Runs GraphiQL server to view & query composites.
 */
const server = await serveEncodedDefinition({
    ceramicURL: CERAMIC_NODE_URL,
    graphiql: true,
    path: `${process.cwd()}/ceramic/__generated__/definition.json`,
    port: 5001,
});

console.log(`Server started on ${server.port}`);
