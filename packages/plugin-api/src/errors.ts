export type ErrorCategory = "user-action" | "retryable" | "corrupt" | "fatal";

export class MiniclawError extends Error {
	constructor(
		message: string,
		public readonly category: ErrorCategory,
		public readonly recoverable: boolean,
		public readonly userAction?: string,
	) {
		super(message);
		this.name = "MiniclawError";
	}
}

export class UserActionError extends MiniclawError {
	constructor(message: string, userAction: string) {
		super(message, "user-action", false, userAction);
		this.name = "UserActionError";
	}
}

export class RetryableError extends MiniclawError {
	public readonly maxRetries: number;
	constructor(message: string, maxRetries = 3) {
		super(message, "retryable", true);
		this.name = "RetryableError";
		this.maxRetries = maxRetries;
	}
}

export class CorruptDataError extends MiniclawError {
	public readonly backupAvailable: boolean;
	constructor(message: string, backupAvailable: boolean) {
		super(message, "corrupt", true);
		this.name = "CorruptDataError";
		this.backupAvailable = backupAvailable;
	}
}

export class FatalError extends MiniclawError {
	constructor(message: string) {
		super(message, "fatal", false);
		this.name = "FatalError";
	}
}
