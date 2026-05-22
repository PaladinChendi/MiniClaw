import { dirname, join } from "path";
import { open, readdir, rename, stat, unlink, writeFile } from "fs/promises";

export interface AtomicWriteOptions {
	tmpPrefix?: string;
	tmpSuffix?: string;
	fsync?: boolean;
	encoding?: BufferEncoding;
}

const TMP_FILE_AGE_MS = 5 * 60 * 1000;

let atomicCounter = 0;

export async function writeFileAtomic(
	filePath: string,
	data: string | Buffer | Uint8Array,
	options: AtomicWriteOptions = {},
): Promise<void> {
	const { tmpPrefix = ".tmp-", tmpSuffix = "", fsync = true, encoding = "utf-8" } = options;

	const dir = dirname(filePath);
	const tmpPath = join(dir, `${tmpPrefix}${Date.now()}-${process.pid}-${atomicCounter++}${tmpSuffix}`);

	try {
		await writeFile(tmpPath, data, encoding);

		if (fsync) {
			const fh = await open(tmpPath, "r");
			await fh.sync();
			await fh.close();
		}

		await rename(tmpPath, filePath);
	} catch (err) {
		try {
			await unlink(tmpPath);
		} catch {
			/* ignore */
		}
		throw err;
	}
}

export async function cleanupTempFiles(dir: string, prefix = ".tmp-"): Promise<void> {
	const entries = await readdir(dir);
	const now = Date.now();
	for (const entry of entries) {
		if (!entry.startsWith(prefix)) continue;
		const fullPath = join(dir, entry);
		const s = await stat(fullPath);
		if (now - s.mtimeMs > TMP_FILE_AGE_MS) {
			await unlink(fullPath);
		}
	}
}
