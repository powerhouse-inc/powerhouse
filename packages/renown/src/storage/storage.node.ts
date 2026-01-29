import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BaseStorage } from "./common.js";

export class NodeStorage<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends BaseStorage<T> {
  private readonly filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;

    const parentFolder = dirname(this.filePath);
    mkdirSync(parentFolder, { recursive: true });

    if (!existsSync(this.filePath)) {
      writeFileSync(this.filePath, JSON.stringify({}));
    }
  }

  private readData(): T {
    const data = readFileSync(this.filePath, "utf-8");
    return JSON.parse(data) as T;
  }

  private writeData(data: T): void {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  get<Key extends keyof T>(key: Key): T[Key] | undefined {
    const data = this.readData();
    return data[key];
  }

  set<Key extends keyof T>(key: Key, value?: T[Key]): void {
    const data = this.readData();
    if (value === undefined) {
      delete data[key];
    } else {
      data[key] = value;
    }
    this.writeData(data);
  }

  delete(key: keyof T): void {
    const data = this.readData();
    delete data[key];
    this.writeData(data);
  }
}
