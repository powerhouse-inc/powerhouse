import { NextApiRequest, NextApiResponse } from "next/types";
import { allowCors } from "../[utils]";
import { PowerhouseVerifiableCredential } from "../../../services/credential";
import {
    authenticateDID,
    getCredentials,
    revokeCredential,
    storeCredential,
} from "../../../services/ceramic";

console.time("authenticateDID");
await authenticateDID();
console.timeEnd("authenticateDID");

async function handler(req: NextApiRequest, res: NextApiResponse) {
    console.time("handler");
    if (req.method === "GET") {
        const { address, chainId, connectId } = req.query;
        if (!connectId || !chainId || !address) {
            res.status(400).json({});
            return;
        }
        const result = await getCredentials(
            address as string,
            parseInt(chainId as string),
            connectId as string
        );

        if (result.errors?.length) {
            throw result.errors[0];
        }
        res.status(200).json({
            credential:
                result.data?.verifiableCredentialEIP712Index.edges[0]?.node,
        });
    } else if (req.method === "POST") {
        const credential = req.body
            .credential as PowerhouseVerifiableCredential;
        if (!credential) {
            res.status(400).json({});
            return;
        }

        try {
            const result = await storeCredential(credential);
            if (result.errors?.length) {
                throw result.errors[0];
            }
            res.status(200).json({
                credential:
                    result.data?.createVerifiableCredentialEIP712.document,
            });
        } catch (e) {
            console.error(e);
            res.status(500).json(e);
            return;
        }
    } else if (req.method === "DELETE") {
        const { id } = req.query;
        if (!id) {
            res.status(400).json({});
            return;
        }
        const result = await revokeCredential(id as string);
        if (result.errors?.length) {
            throw result.errors[0];
        }
        res.status(200).json({
            credential: result.data?.updateVerifiableCredentialEIP712.document,
        });
    } else {
        res.status(405).json({});
    }
    console.timeEnd("handler");
}

export default allowCors(handler);
