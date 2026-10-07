import { readFileSync } from 'node:fs';
import * as v from 'valibot';

export const localDatabaseId = '00000000-0000-4000-8000-000000000020';
const databaseId = v.pipe(
  v.string(),
  v.uuid(),
  v.toLowerCase(),
  v.check((id) => id !== localDatabaseId && !id.startsWith('00000000-')),
);
const domain = v.pipe(
  v.string(),
  v.maxLength(253),
  v.regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  v.check((name) => !/(?:^|\.)(?:example\.(?:com|net|org)|invalid|test|localhost)$/.test(name)),
);
const deploymentSchema = v.pipe(
  v.strictObject({
    preview: v.strictObject({ databaseId }),
    production: v.strictObject({ databaseId, domain }),
  }),
  v.check((config) => config.preview.databaseId !== config.production.databaseId),
);
export type DeploymentConfig = v.InferOutput<typeof deploymentSchema>;

export function parseDeploymentConfig(input: unknown): DeploymentConfig {
  const result = v.safeParse(deploymentSchema, input);
  if (!result.success) {
    throw new Error(
      'Invalid deployment config. Set distinct remote D1 UUIDs and a production hostname in deployment.local.json; do not use example values.',
    );
  }
  return result.output;
}

export function loadDeploymentConfig(): DeploymentConfig {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync('deployment.local.json', 'utf8'));
  } catch {
    throw new Error(
      'Missing or unreadable deployment.local.json. Copy deployment.example.json, chmod 600, and edit it before remote operations.',
    );
  }
  return parseDeploymentConfig(input);
}
