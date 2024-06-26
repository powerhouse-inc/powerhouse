import type { Buffer } from 'buffer';
import Sha1 from 'sha.js/sha1';
import Sha256 from 'sha.js/sha256';

const FileSystemError = new Error('File system not available.');

export function writeFile(
    path: string,
    name: string,
    stream: Uint8Array,
): Promise<string> {
    throw FileSystemError;
}

export function readFile(path: string) {
    throw FileSystemError;
}

export function fetchFile(
    url: string,
): Promise<{ data: Buffer; mimeType?: string }> {
    throw FileSystemError;
}

export const getFile = async (file: string) => {
    return readFile(file);
};

const hashAlgorithms = {
    sha1: Sha1,
    sha256: Sha256,
} as const;

export const hash = (
    data: string | ArrayBuffer | DataView,
    algorithm = 'sha1',
) => {
    if (!['sha1', 'sha256'].includes(algorithm)) {
        throw new Error(
            'Hashing algorithm not supported: Available: sha1, sha256',
        );
    }

    const Algorithm = hashAlgorithms[algorithm as keyof typeof hashAlgorithms];
    const sha = new Algorithm();

    return sha.update(data).digest('base64');
};
