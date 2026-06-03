export type ErrorDetails = Record<string, unknown> | unknown[] | undefined;

export class AppError extends Error {
  readonly httpStatus: number;
  readonly code: string;
  readonly details?: ErrorDetails;
  readonly isOperational = true;

  constructor(
    httpStatus: number,
    code: string,
    message: string,
    details?: ErrorDetails,
    options?: { cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.httpStatus = httpStatus;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: ErrorDetails) {
    super(400, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message);
    this.name = "UnauthorizedError";
  }
}
