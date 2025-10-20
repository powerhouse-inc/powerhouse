class LRUNode<K> {
  key: K;
  prev: LRUNode<K> | undefined;
  next: LRUNode<K> | undefined;

  constructor(key: K) {
    this.key = key;
    this.prev = undefined;
    this.next = undefined;
  }
}

export class LRUTracker<K> {
  private map: Map<K, LRUNode<K>>;
  private head: LRUNode<K> | undefined;
  private tail: LRUNode<K> | undefined;

  constructor() {
    this.map = new Map();
    this.head = undefined;
    this.tail = undefined;
  }

  get size(): number {
    return this.map.size;
  }

  touch(key: K): void {
    const node = this.map.get(key);

    if (node) {
      this.moveToFront(node);
    } else {
      this.addToFront(key);
    }
  }

  evict(): K | undefined {
    if (!this.tail) {
      return undefined;
    }

    const key = this.tail.key;
    this.remove(key);
    return key;
  }

  remove(key: K): void {
    const node = this.map.get(key);
    if (!node) {
      return;
    }

    this.removeNode(node);
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
    this.head = undefined;
    this.tail = undefined;
  }

  private addToFront(key: K): void {
    const node = new LRUNode(key);
    this.map.set(key, node);

    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      node.next = this.head;
      this.head.prev = node;
      this.head = node;
    }
  }

  private moveToFront(node: LRUNode<K>): void {
    if (node === this.head) {
      return;
    }

    this.removeNode(node);
    node.prev = undefined;
    node.next = this.head;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode<K>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }
}
