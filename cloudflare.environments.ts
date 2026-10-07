import { loadDeploymentConfig, localDatabaseId } from './deployment.config.ts';
import type { DeploymentConfig } from './deployment.config.ts';

const environments = {
  local: { name: 'startree-local', databaseName: 'startree-local', namespace: '10020' },
  preview: { name: 'startree-preview', databaseName: 'startree-preview', namespace: '20020' },
  production: { name: 'startree', databaseName: 'startree-production', namespace: '30020' },
};

export function getEnvironment(mode: string | undefined, deployment?: DeploymentConfig) {
  if (mode !== 'local' && mode !== 'preview' && mode !== 'production') {
    throw new Error('Select an explicit Cloudflare mode: local, preview, or production.');
  }
  if (mode === 'local') {
    return { ...environments.local, databaseId: localDatabaseId, domains: [] };
  }
  const config = deployment ?? loadDeploymentConfig();
  return {
    ...environments[mode],
    databaseId: config[mode].databaseId,
    domains: mode === 'production' ? [config.production.domain] : [],
  };
}
