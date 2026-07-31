export class BusyTexCompileError extends Error {
  constructor(
    message: string,
    readonly compileLog: string,
  ) {
    super(message);
    this.name = "BusyTexCompileError";
  }
}
