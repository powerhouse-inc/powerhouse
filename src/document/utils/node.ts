import fs from 'fs';
import https from 'https';
import mime from 'mime/lite';
import { join } from 'path';

export function writeFile(
    path: string,
    name: string,
    stream: NodeJS.ReadableStream
): Promise<string> {
    const filePath = join(path, name);
    fs.mkdirSync(path, { recursive: true });

    return new Promise((resolve, reject) => {
        try {
            // file.generateNodeStream({ type: 'nodebuffer', streamFiles: true })
            stream
                .pipe(fs.createWriteStream(filePath))
                .on('finish', () => {
                    resolve(filePath);
                })
                .on('error', error => {
                    reject(error);
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

export const getFile = async (
    file: string
): Promise<{ data: Buffer; mimeType?: string }> => {
    if (fs.existsSync(file)) {
        return {
            data: readFile(file),
            mimeType: mime.getType(file) || undefined,
        };
    }
    return fetchFile(file);
};
