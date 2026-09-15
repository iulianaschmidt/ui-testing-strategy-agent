import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .refine((value) => new URL(value).protocol === "https:", "must use HTTPS");

export const RuntimeConfigSchema = z.object({
  tenantId: z.string().min(1),
  clientId: z.string().uuid(),
  sourceFolderUrl: httpsUrl,
  destinationSiteUrl: httpsUrl,
  maxFileBytes: z
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  storeExcerpts: z.boolean().default(false),
  planTtlMinutes: z.number().int().positive().max(1440).default(30),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected true or false, received ${value}`);
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function loadRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const result = RuntimeConfigSchema.safeParse({
    tenantId: environment.UI_EVIDENCE_TENANT_ID,
    clientId: environment.UI_EVIDENCE_CLIENT_ID,
    sourceFolderUrl: environment.UI_EVIDENCE_SOURCE_FOLDER_URL,
    destinationSiteUrl: environment.UI_EVIDENCE_DESTINATION_SITE_URL,
    maxFileBytes: parsePositiveInteger(
      environment.UI_EVIDENCE_MAX_FILE_BYTES,
      20 * 1024 * 1024,
      "UI_EVIDENCE_MAX_FILE_BYTES",
    ),
    storeExcerpts: parseBoolean(environment.UI_EVIDENCE_STORE_EXCERPTS, false),
    planTtlMinutes: parsePositiveInteger(
      environment.UI_EVIDENCE_PLAN_TTL_MINUTES,
      30,
      "UI_EVIDENCE_PLAN_TTL_MINUTES",
    ),
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "configuration"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid UI evidence configuration: ${details}`);
  }
  return result.data;
}

export function inspectRuntimeConfig(environment: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  missing: string[];
  errors: string[];
} {
  const names = [
    "UI_EVIDENCE_TENANT_ID",
    "UI_EVIDENCE_CLIENT_ID",
    "UI_EVIDENCE_SOURCE_FOLDER_URL",
    "UI_EVIDENCE_DESTINATION_SITE_URL",
  ] as const;
  const missing = names.filter((name) => !environment[name]);
  if (missing.length > 0) return { configured: false, missing: [...missing], errors: [] };

  try {
    loadRuntimeConfig(environment);
    return { configured: true, missing: [], errors: [] };
  } catch (error) {
    return {
      configured: false,
      missing: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
