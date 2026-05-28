import type { CircuitBreakerConfig, CircuitBreakerState } from "./types.ts";

const DEFAULT_CONFIG: CircuitBreakerConfig = {
	halfOpenAfterMs: 600000,
	successThreshold: 2,
	failureThreshold: 3,
};

export class CircuitBreaker {
	private config: CircuitBreakerConfig;
	private _state: CircuitBreakerState = "closed";
	private failureCount = 0;
	private successCount = 0;
	private lastFailureTime = 0;

	constructor(config: Partial<CircuitBreakerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	get state(): CircuitBreakerState {
		if (this._state === "open") {
			const elapsed = Date.now() - this.lastFailureTime;
			if (elapsed >= this.config.halfOpenAfterMs) {
				return "half-open";
			}
		}
		return this._state;
	}

	allowRequest(): boolean {
		const currentState = this.state;
		if (currentState === "closed") return true;
		if (currentState === "half-open") return true;
		return false;
	}

	recordSuccess(): void {
		const currentState = this.state;
		if (currentState === "half-open") {
			this.successCount++;
			if (this.successCount >= this.config.successThreshold) {
				this._state = "closed";
				this.failureCount = 0;
				this.successCount = 0;
			}
		} else if (currentState === "closed") {
			this.failureCount = 0;
		}
	}

	recordFailure(): void {
		const currentState = this.state;
		this.lastFailureTime = Date.now();

		if (currentState === "closed") {
			this.failureCount++;
			if (this.failureCount >= this.config.failureThreshold) {
				this._state = "open";
			}
		} else if (currentState === "half-open") {
			this._state = "open";
			this.successCount = 0;
		}
	}

	reset(): void {
		this._state = "closed";
		this.failureCount = 0;
		this.successCount = 0;
		this.lastFailureTime = 0;
	}
}
