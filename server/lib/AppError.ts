export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}
