type HealthCheck = () => Promise<boolean>;

export class HeartbeatSystem {
	private checks = new Map<string, HealthCheck>();

	register(name: string, check: HealthCheck): void {
		this.checks.set(name, check);
	}

	unregister(name: string): void {
		this.checks.delete(name);
	}

	listChecks(): string[] {
		return [...this.checks.keys()];
	}

	async isAlive(): Promise<boolean> {
		if (this.checks.size === 0) return true;
		for (const [_, check] of this.checks) {
			try {
				if (!(await check())) return false;
			} catch {
				return false;
			}
		}
		return true;
	}
}
