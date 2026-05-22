import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";
import { SkillLoader } from "../../src/skill/skill-loader.ts";

const testDir = join(import.meta.dir, "__tmp_skill__");

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});
afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("SkillLoader", () => {
	it("discovers skills from directories with SKILL.md", async () => {
		const skillDir = join(testDir, "my-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(
			join(skillDir, "SKILL.md"),
			"---\nid: my-skill\nname: My Skill\ndescription: A test skill\ntags: [test]\n---\nSkill content here",
		);

		const loader = new SkillLoader([testDir]);
		const skills = await loader.listSkills();
		expect(skills.length).toBe(1);
		expect(skills[0].id).toBe("my-skill");
		expect(skills[0].name).toBe("My Skill");
	});

	it("loads skill content by id", async () => {
		const skillDir = join(testDir, "test-skill");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "---\nid: test-skill\nname: Test\n---\nThis is the skill body");

		const loader = new SkillLoader([testDir]);
		const content = await loader.loadSkill("test-skill");
		expect(content.id).toBe("test-skill");
		expect(content.content).toContain("This is the skill body");
	});

	it("returns empty list when no skills found", async () => {
		const loader = new SkillLoader([testDir]);
		const skills = await loader.listSkills();
		expect(skills).toEqual([]);
	});

	it("loadSkill throws for unknown id", async () => {
		const loader = new SkillLoader([testDir]);
		expect(loader.loadSkill("nonexistent")).rejects.toThrow("not found");
	});

	it("caches manifest after discovery", async () => {
		const skillDir = join(testDir, "cached");
		await mkdir(skillDir, { recursive: true });
		await writeFile(join(skillDir, "SKILL.md"), "---\nid: cached\nname: Cached Skill\n---\nBody");

		const loader = new SkillLoader([testDir]);
		const skills1 = await loader.listSkills();
		expect(skills1.length).toBe(1);

		// Delete the file — cache should still serve
		await rm(join(skillDir, "SKILL.md"));
		const skills2 = await loader.listSkills();
		expect(skills2.length).toBe(1);
	});
});
