import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import { join } from 'path';

export function writeFile(
    path: string,
    name: string,
    data: Uint8Array
): Promise<string> {
    const filePath = join(path, name);
    fs.mkdirSync(path, { recursive: true });

    return new Promise((resolve, reject) => {
        try {
            fs.writeFile(filePath, data, {}, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve(filePath);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function readFile(path: string) {
    return fs.readFileSync(path);
}

export function fetchFile(
    url: string
): Promise<{ data: Buffer; mimeType?: string }> {
    return new Promise((resolve, reject) => {
        https
            .get(url, resp => {
                const data: Uint8Array[] = [];
                const mimeType = resp.headers['content-type'];
                resp.on('data', chunk => {
                    data.push(chunk);
                });

                resp.on('end', () => {
                    resolve({ data: Buffer.concat(data), mimeType });
                });
            })
            .on('error', err => {
                reject(err);
            });
    });
}

export const getFile = async (file: string) => {
    return readFile(file);
};

export const hash = (data: string, algorithm = 'sha1') =>
    crypto.createHash(algorithm).update(data).digest('base64');
