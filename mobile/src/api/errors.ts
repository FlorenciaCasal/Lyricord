export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number | null; code?: string | null; retryable?: boolean } = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? false;
  }
}

export function isTransientApiError(error: unknown) {
  if (error instanceof ApiRequestError) return error.retryable;
  return error instanceof TypeError || (
    error instanceof Error && /network|fetch|timeout|timed out|connection/i.test(error.message)
  );
}
