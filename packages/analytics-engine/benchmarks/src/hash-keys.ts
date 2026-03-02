import { readFileSync } from "fs";
import { Bench } from "tinybench";
import { crc32 } from "crc";
import { createHash } from "crypto";

const queries = JSON.parse(readFileSync("./data/query-list.json", "utf-8")).map(
  (q: object) => JSON.stringify(q),
);
const bench = new Bench({ warmup: true });

const hashCrc = (val: string) => crc32(val).toString(16);
const hashBlake = (val: string) =>
  createHash("BLAKE2s256").update(val).digest("hex");
const hashSha256 = (val: string) =>
  createHash("sha256").update(val).digest("hex");
const hashSha512 = (val: string) =>
  createHash("sha512").update(val).digest("hex");

bench
  .add("CRC32", () => {
    for (const query of queries) {
      hashCrc(query);
    }
  })
  .add("SHA256", () => {
    for (const query of queries) {
      hashSha256(query);
    }
  })
  .add("SHA512", () => {
    for (const query of queries) {
      hashSha512(query);
    }
  })
  .add("BLAKE2s256", () => {
    for (const query of queries) {
      hashBlake(query);
    }
  });

await bench.run();

console.table(bench.table());
