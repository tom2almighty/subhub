export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function badRequest(message: string, code = 'BAD_REQUEST'): ApiError {
  return new ApiError(400, code, message);
}

export function unauthorized(message = 'Authentication required'): ApiError {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden'): ApiError {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function notFound(message: string, code = 'NOT_FOUND'): ApiError {
  return new ApiError(404, code, message);
}

export function conflict(message: string, code = 'CONFLICT'): ApiError {
  return new ApiError(409, code, message);
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    `${(error as { code?: string }).code ?? ''}`.startsWith('SQLITE_CONSTRAINT')
  );
}
