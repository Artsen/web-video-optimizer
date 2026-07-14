export class StorageBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageBoundaryError";
  }
}
