import { readFileSync } from "fs";
import * as jose from "jose";
import { executeOnce } from "../utils";

const alg = "ES512";
const pkcs8 =
    process.env.JWT_PRIVATE_KEY ||
    readFileSync("./.secret/private.key", "utf-8");

const importPrivateKey = executeOnce(() => jose.importPKCS8(pkcs8, alg));

export async function generateJWT(accountAddress: string, publicKey: string) {
    const alg = "ES512";
    const privateKey = await importPrivateKey();

    const jwt = await new jose.SignJWT({ publicKey, address: accountAddress })
        .setProtectedHeader({ alg })
        .setSubject(accountAddress.toLowerCase())
        .setIssuedAt()
        // .setIssuer('urn:example:issuer')
        // .setAudience('urn:example:audience')
        // .setExpirationTime('2h')
        .sign(privateKey);
    return jwt;
}

export async function readJWT(token: string) {
    return jose.decodeJwt(token);
}
