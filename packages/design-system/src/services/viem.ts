export function getIsTransaction(hash: string | null | undefined) {
    if (!isHexString(hash)) return false;
    return hash.length === 66;
}

export function isHexString(
    value: string | null | undefined,
): value is `0x${string}` {
    return typeof value === 'string' && value.startsWith('0x');
}
