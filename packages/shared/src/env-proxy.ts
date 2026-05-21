export function createEnvProxy(allowedKeys: string[]): NodeJS.ProcessEnv {
	const allowed = new Set(allowedKeys);
	return new Proxy(process.env, {
		get(target, prop: string) {
			if (allowed.has(prop)) return target[prop];
			return undefined;
		},
		has(target, prop: string) {
			return allowed.has(prop) && prop in target;
		},
		ownKeys(target) {
			return Object.keys(target).filter((k) => allowed.has(k));
		},
		getOwnPropertyDescriptor(target, prop: string) {
			if (allowed.has(prop) && prop in target) {
				return { value: target[prop], writable: false, configurable: true, enumerable: true };
			}
			return undefined;
		},
		set() {
			return true;
		},
		defineProperty() {
			return true;
		},
		deleteProperty() {
			return true;
		},
	});
}
