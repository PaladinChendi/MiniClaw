export interface PluginPermissions {
  fs?: string[];
  net?: string[];
  child_process?: boolean;
  env?: string[];
}

export interface PluginManifest {
  name: string;
  version: string;
  type: "channel" | "memory" | "skill" | "rag";
  displayName?: string;
  description?: string;
  status?: "implemented" | "stub";
  trusted?: boolean;
  permissions: PluginPermissions;
  buildCommand?: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors?: string[];
}

export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: string[] = [];
  const m = raw as Record<string, unknown>;

  if (!m.permissions || typeof m.permissions !== "object") {
    throw new Error("permissions field required");
  }
  const perms = m.permissions as Record<string, unknown>;

  if (Array.isArray(perms.fs) && perms.fs.includes("*")) {
    throw new Error("wildcard fs permission not allowed");
  }

  if (Array.isArray(perms.fs)) {
    for (const p of perms.fs as string[]) {
      if (p.includes("..")) throw new Error("path traversal detected");
    }
  }

  if (perms.child_process === true && m.trusted !== true) {
    throw new Error("child_process requires trusted:true");
  }

  return { valid: true };
}
