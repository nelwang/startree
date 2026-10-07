import { createConfiguration } from '../cloudflare.config.ts';
import { getEnvironment } from '../cloudflare.environments.ts';
import { deploymentFixture } from './deployment-fixture.mjs';
const configuration = createConfiguration(deploymentFixture);
const environments = Object.fromEntries(
  ['local', 'preview', 'production'].map((mode) => [mode, getEnvironment(mode, deploymentFixture)]),
);
const { local, preview, production } = Object.fromEntries(
  await Promise.all(
    Object.keys(environments).map(async (mode) => [
      mode,
      (await configuration({ mode, isPreview: false })).worker,
    ]),
  ),
);
const identities = Object.entries(environments).map(([mode, environment]) => ({
  mode,
  database: environment.databaseName,
  databaseId: environment.databaseId,
  worker: environment.name,
}));

const configurationFailure = (check, message) => {
  console.error(JSON.stringify({ event: 'configuration_failure', check }));
  throw new Error(message);
};

if (new Set(identities.map(({ worker }) => worker)).size !== identities.length) {
  configurationFailure(
    'worker_environment_isolation',
    'Local, preview, and production Worker names must be distinct.',
  );
}

if (preview.name !== 'startree-preview' || production.name !== 'startree') {
  configurationFailure(
    'worker_names',
    'Preview must use startree-preview and production must use startree.',
  );
}

if (new Set(identities.map(({ database }) => database)).size !== identities.length) {
  configurationFailure(
    'database_environment_isolation',
    'Local, preview, and production D1 database names must be distinct.',
  );
}

if (preview.workersDev !== true || preview.previewUrls !== false) {
  configurationFailure('preview_surfaces', 'Preview must use only its fixed workers.dev hostname.');
}

const productionRoute = production.domains?.includes(deploymentFixture.production.domain);
if (
  production.workersDev !== false ||
  production.previewUrls !== false ||
  productionRoute !== true
) {
  configurationFailure(
    'production_surfaces',
    'Production must serve only the configured custom domain.',
  );
}

for (const [name, environment] of Object.entries({ local, preview, production })) {
  const expected = getEnvironment(name, deploymentFixture);
  if (
    environment.name !== expected.name ||
    environment.env.DB.id !== expected.databaseId ||
    environment.env.DB.name !== expected.databaseName
  ) {
    configurationFailure(
      'resource_bindings',
      `${name} must use its pinned Worker and database identities.`,
    );
  }
  if (
    environment.assets?.runWorkerFirst !== true ||
    environment.assets?.notFoundHandling !== 'single-page-application'
  ) {
    configurationFailure('asset_routing', `${name} must preserve Worker-first SPA routing.`);
  }
  const rateLimit = environment.env.MUTATION_RATE_LIMITER;
  if (rateLimit.namespace !== expected.namespace)
    configurationFailure('rate_limit_isolation', `${name} must use its own rate-limit namespace.`);
  if (rateLimit?.simple?.limit !== 120 || rateLimit.simple.period !== 60) {
    configurationFailure(
      'mutation_rate_limit',
      `${name} must limit Bookmark mutations to 120 requests per minute.`,
    );
  }
}

console.log('Environment isolation verified:', identities);

if (new Set(identities.map((item) => item.databaseId)).size !== 3)
  throw new Error('Database IDs must be isolated.');
for (const mode of [undefined, '', 'development', 'staging']) {
  let rejected = false;
  try {
    getEnvironment(mode);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Unknown modes must fail closed.');
}
