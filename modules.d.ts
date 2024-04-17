interface IHasher {
    update(data: string): IHasherWithData;
}

interface IHasherWithData {
    digest(encoding: string): string;
}

declare class Hasher implements IHasher {
    constructor();
    update(data: string): IHasherWithData;
}

declare class Sha1 extends Hasher {}
declare class Sha256 extends Hasher {}

declare module 'sha.js/sha1' {
    export default Sha1;
}

declare module 'sha.js/sha256' {
    export default Sha256;
}
