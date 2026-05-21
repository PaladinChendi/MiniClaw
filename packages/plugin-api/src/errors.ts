export type ErrorCategory = "user-action" | "retryable" | "corrupt" | "fatal";

export class EbsclawError extends Error {
  constructor(
    message: string,
    public readonly category: ErrorCategory,
    public readonly recoverable: boolean,
    public readonly userAction?: string,
  ) {
    super(message);
    this.name = "EbsclawError";
  }
}

export class UserActionError extends EbsclawError {
  constructor(message: string, userAction: string) {
    super(message, "user-action", false, userAction);
    this.name = "UserActionError";
  }
}

export class RetryableError extends EbsclawError {
  public readonly maxRetries: number;
  constructor(message: string, maxRetries: number = 3) {
    super(message, "retryable", true);
    this.name = "RetryableError";
    this.maxRetries = maxRetries;
  }
}

export class CorruptDataError extends EbsclawError {
  public readonly backupAvailable: boolean;
  constructor(message: string, backupAvailable: boolean) {
    super(message, "corrupt", true);
    this.name = "CorruptDataError";
    this.backupAvailable = backupAvailable;
  }
}

export class FatalError extends EbsclawError {
  constructor(message: string) {
    super(message, "fatal", false);
    this.name = "FatalError";
  }
}
