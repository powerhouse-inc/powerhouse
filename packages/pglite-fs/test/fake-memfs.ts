const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;

interface Node {
  mode: number;
  data?: Uint8Array;
  children?: Map<string, Node>;
}

export class FakeMemFs {
  private readonly rootNode: Node = {
    mode: S_IFDIR | 0o755,
    children: new Map(),
  };

  readdir(p: string): string[] {
    const node = this.lookup(p);
    if (!node.children) throw new Error(`ENOTDIR ${p}`);
    return [".", "..", ...node.children.keys()];
  }

  stat(p: string): { mode: number; size: number } {
    const node = this.lookup(p);
    return { mode: node.mode, size: node.data?.byteLength ?? 4096 };
  }

  readFile(p: string): Uint8Array {
    const node = this.lookup(p);
    if (!node.data) throw new Error(`EISDIR ${p}`);
    return node.data.slice();
  }

  writeFile(p: string, data: Uint8Array): void {
    const { parent, name } = this.parentOf(p);
    const existing = parent.children!.get(name);
    if (existing) {
      existing.data = data.slice();
      return;
    }
    parent.children!.set(name, { mode: S_IFREG | 0o666, data: data.slice() });
  }

  mkdir(p: string, mode = 0o777): void {
    const { parent, name } = this.parentOf(p);
    if (parent.children!.has(name)) throw new Error(`EEXIST ${p}`);
    parent.children!.set(name, {
      mode: S_IFDIR | (mode & 0o7777),
      children: new Map(),
    });
  }

  chmod(p: string, mode: number): void {
    const node = this.lookup(p);
    node.mode = (node.mode & ~0o7777) | (mode & 0o7777);
  }

  analyzePath(p: string): { exists: boolean } {
    try {
      this.lookup(p);
      return { exists: true };
    } catch {
      return { exists: false };
    }
  }

  isDir(mode: number): boolean {
    return (mode & 0o170000) === S_IFDIR;
  }

  isFile(mode: number): boolean {
    return (mode & 0o170000) === S_IFREG;
  }

  private lookup(p: string): Node {
    let node = this.rootNode;
    for (const part of p.split("/").filter(Boolean)) {
      const next = node.children?.get(part);
      if (!next) throw new Error(`ENOENT ${p}`);
      node = next;
    }
    return node;
  }

  private parentOf(p: string): { parent: Node; name: string } {
    const parts = p.split("/").filter(Boolean);
    const name = parts.pop()!;
    const parent = this.lookup("/" + parts.join("/"));
    if (!parent.children) throw new Error(`ENOTDIR ${p}`);
    return { parent, name };
  }
}

export const FAKE_ROOT = "/tmp/pglite/base";
export const FAKE_LARGE_FILE_SIZE = 5000;

function pattern(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    out[i] = x >>> 24;
  }
  return out;
}

export function buildDeterministicTree(): FakeMemFs {
  const fs = new FakeMemFs();
  const enc = new TextEncoder();
  const file = (p: string, data: Uint8Array, mode: number) => {
    fs.writeFile(FAKE_ROOT + "/" + p, data);
    fs.chmod(FAKE_ROOT + "/" + p, mode);
  };
  fs.mkdir("/tmp");
  fs.mkdir("/tmp/pglite");
  fs.mkdir(FAKE_ROOT, 0o755);
  file("PG_VERSION", enc.encode("17\n"), 0o600);
  fs.mkdir(FAKE_ROOT + "/base", 0o711);
  fs.mkdir(FAKE_ROOT + "/base/5", 0o711);
  file("base/5/1259", pattern(FAKE_LARGE_FILE_SIZE, 1), 0o600);
  file("base/5/1259_fsm", pattern(123, 2), 0o600);
  fs.mkdir(FAKE_ROOT + "/pg_empty", 0o755);
  file("postmaster.opts", new Uint8Array(0), 0o644);
  fs.mkdir(FAKE_ROOT + "/données", 0o751);
  file("données/ü-日本.txt", enc.encode("non-ascii path"), 0o640);
  return fs;
}
