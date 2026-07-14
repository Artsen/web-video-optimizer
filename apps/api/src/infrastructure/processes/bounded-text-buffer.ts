type BoundedTextBufferMode = "full" | "tail";

export class BoundedTextBuffer {
  readonly #maxBytes: number;
  readonly #mode: BoundedTextBufferMode;
  #chunks: Buffer[] = [];
  #byteLength = 0;
  #overflowed = false;

  constructor(maxBytes: number, mode: BoundedTextBufferMode) {
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new Error(`Invalid max text buffer bytes: ${maxBytes}`);
    }
    this.#maxBytes = maxBytes;
    this.#mode = mode;
  }

  get byteLength(): number {
    return this.#byteLength;
  }

  get overflowed(): boolean {
    return this.#overflowed;
  }

  append(chunk: Buffer | string): void {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (buffer.length === 0) return;

    if (this.#mode === "full") {
      this.#appendFull(buffer);
      return;
    }

    this.#appendTail(buffer);
  }

  clear(): void {
    this.#chunks = [];
    this.#byteLength = 0;
    this.#overflowed = false;
  }

  toString(): string {
    return Buffer.concat(this.#chunks, this.#byteLength).toString("utf8");
  }

  #appendFull(buffer: Buffer): void {
    if (this.#byteLength + buffer.length > this.#maxBytes) {
      this.#overflowed = true;
      return;
    }
    this.#chunks.push(buffer);
    this.#byteLength += buffer.length;
  }

  #appendTail(buffer: Buffer): void {
    this.#chunks.push(buffer);
    this.#byteLength += buffer.length;

    while (this.#byteLength > this.#maxBytes && this.#chunks.length > 0) {
      this.#overflowed = true;
      const overflow = this.#byteLength - this.#maxBytes;
      const first = this.#chunks[0];
      if (first.length <= overflow) {
        this.#chunks.shift();
        this.#byteLength -= first.length;
        continue;
      }
      this.#chunks[0] = first.subarray(overflow);
      this.#byteLength -= overflow;
    }
  }
}
