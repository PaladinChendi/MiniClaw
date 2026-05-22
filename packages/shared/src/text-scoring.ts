export function hashVector(text: string, dims = 64): number[] {
	const out = new Array(dims).fill(0);
	for (let i = 0; i < text.length; i++) {
		out[i % dims] += text.charCodeAt(i);
	}
	const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
	return out.map((v) => v / norm);
}

export function keywordScore(query: string, text: string): number {
	const qTokens = new Set(query.toLowerCase().split(/\s+/));
	const tTokens = new Set(text.toLowerCase().split(/\s+/));
	let overlap = 0;
	for (const t of qTokens) {
		if (tTokens.has(t)) overlap++;
	}
	return qTokens.size === 0 ? 0 : overlap / qTokens.size;
}
