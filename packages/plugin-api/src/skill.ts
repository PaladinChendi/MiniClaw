import type { Plugin } from "./plugin";

export interface SkillDescriptor {
	id: string;
	name: string;
	description?: string;
	tags?: string[];
}

export interface SkillContent {
	id: string;
	content: string;
	metadata?: Record<string, unknown>;
}

export interface SkillPlugin extends Plugin {
	listSkills(): SkillDescriptor[];
	loadSkill(id: string): Promise<SkillContent>;
}
