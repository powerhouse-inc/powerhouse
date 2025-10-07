import { readFileSync } from "fs";
import ceramic from "./index.mjs";
import {
    createComposite,
    readEncodedComposite,
    writeEncodedComposite,
    writeEncodedCompositeRuntime,
} from "@composedb/devtools-node";
import { Composite } from "@composedb/devtools";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import { fromString } from "uint8arrays/from-string";
import ora from "ora";

const spinner = ora();

/**
 * @param {import("ora").Ora} spinner - to provide progress status.
 * @return {Promise<void>} - return void when composite finishes deploying.
 */
export const writeComposite = async (spinner) => {
    await authenticate();
    spinner.info("writing composite to Ceramic");

    const verifiableCredentialComposite = await createComposite(
        //@ts-ignore
        ceramic,
        `${process.cwd()}/ceramic/composites/00-verifiableCredential.graphql`
    );

    await writeEncodedComposite(
        verifiableCredentialComposite,
        `${process.cwd()}/ceramic/__generated__/definition.json`
    );

    spinner.info("creating composite for runtime usage");
    await writeEncodedCompositeRuntime(
        //@ts-ignore
        ceramic,
        `${process.cwd()}/ceramic/__generated__/definition.json`,
        `${process.cwd()}/ceramic/__generated__/definition.js`
    );
    spinner.info("deploying composite");
    const deployComposite = await readEncodedComposite(
        //@ts-ignore
        ceramic,
        `${process.cwd()}/ceramic/__generated__/definition.json`
    );

    // @ts-ignore
    await deployComposite.startIndexingOn(ceramic);
    spinner.succeed("composite deployed & ready for use");
};

/**
 * Authenticating DID for publishing composite
 * @return {Promise<void>} - return void when DID is authenticated.
 */
const authenticate = async () => {
    const seed = readFileSync(`${process.cwd()}/ceramic/admin_seed.txt`);
    const key = fromString(seed, "base16");
    const did = new DID({
        resolver: getResolver(),
        provider: new Ed25519Provider(key),
    });
    await did.authenticate();
    await ceramic.setDID(did);
};

writeComposite(spinner);
