import { CeramicClient } from "@ceramicnetwork/http-client";
// import { ComposeClient } from "@composedb/client";
// import { definition } from "../src/__generated__/definition.js";

const CERAMIC_NODE_URL = process.env.CERAMIC_NODE_URL;
if (!CERAMIC_NODE_URL) {
    throw new Error("CERAMIC_NODE_URL is not set");
}

/**
 * Configure ceramic Client & create context.
 */
const ceramicClient = new CeramicClient(CERAMIC_NODE_URL);

export default ceramicClient;

// const composeClient = new ComposeClient({
//     ceramic: CERAMIC_NODE_URL,
//     // @ts-ignore
//     definition: definition,
// });

// const CeramicContext = { ceramic: ceramic, composeClient: composeClient };

// export default CeramicContext;
