import type { SkillDescriptor, SkillContent } from "@ebsclaw/plugin-api";
import { readdir, readFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

interface ParsedManifest {
	id: string;
	name: string;
	description?: string;
	tags?: string[];
	body: string;
	dir: string;
}

function parseSkillMd(content: string): { frontmatter: Record<string, string>; body: string } {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return { frontmatter: {}, body: content };
	const fm: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const [key, ...rest] = line.split(":");
		if (key && rest.length) fm[key.trim()] = rest.join(":").trim();
	}
	return { frontmatter: fm, body: match[2] };
}

export class SkillLoader {
	private dirs: string[];
	private cache: Map<string, ParsedManifest> | null = null;

	constructor(dirs: string[]) {
		this.dirs = dirs;
	}

	listSkills(): SkillDescriptor[] {
		if (!this.cache) this.discover();
		const skills: SkillDescriptor[] = [];
		for (const m of this.cache!.values()) {
			skills.push({
				id: m.id,
				name: m.name,
				description: m.description,
				tags: m.tags,
			});
		}
		return skills;
	}

	async loadSkill(id: string): Promise<SkillContent> {
		if (!this.cache) this.discover();
		const manifest = this.cache!.get(id);
		if (!manifest) throw new Error(`Skill '${id}' not found`);
		const content = await readFile(join(manifest.dir, "SKILL.md"), "utf-8");
		const { body } = parseSkillMd(content);
		return { id, content: body.trim() };
	}

	private discover(): void {
		this.cache = new Map();
		for (const dir of this.dirs) {
			if (!existsSync(dir)) continue;
			try {
				const entries = require("fs").readdirSync(dir, { withFileTypes: true });
				for (const entry of entries) {
					if (!entry.isDirectory()) continue;
					const skillPath = join(dir, entry.name, "SKILL.md");
					if (!existsSync(skillPath)) continue;
					try {
						const content = require("fs").readFileSync(skillPath, "utf-8");
						const { frontmatter, body } = parseSkillMd(content);
						const id = frontmatter.id || entry.name;
						const tags = frontmatter.tags ? frontmatter.tags.replace(/[[\]]/g, "").split(",").map((t: string) => t.trim()) : undefined;
						this.cache.set(id, {
							id,
							name: frontmatter.name || id,
							description: frontmatter.description,
							tags,
							body,
							dir: join(dir, entry.name),
						});
					} catch {
						// skip malformed
					}
				}
			} catch {
				// skip inaccessible dirs
			}
		}
	}
}
