export interface AuthConfig {
	trustAll: boolean;
	trustList?: string[];
}

export class AuthSystem {
	private config: AuthConfig;

	constructor(config: AuthConfig) {
		this.config = config;
	}

	isTrusted(pluginName: string): boolean {
		if (this.config.trustAll) return true;
		return (this.config.trustList ?? []).includes(pluginName);
	}

	maskApiKey(key: string): string {
		if (key.length <= 8) return "[REDACTED]";
		return `${key.slice(0, 7)}...${key.slice(-4)}`;
	}

	checkPermission(pluginName: string, _resource: string, _action: string): boolean {
		return this.isTrusted(pluginName);
	}
}
