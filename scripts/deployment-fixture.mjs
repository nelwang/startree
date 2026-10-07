import { parseDeploymentConfig } from '../deployment.config.ts';

export const deploymentFixture = parseDeploymentConfig({
  preview: { databaseId: '11111111-1111-4111-8111-111111111111' },
  production: {
    databaseId: '22222222-2222-4222-8222-222222222222',
    domain: 'deployment.fixture.dev',
  },
});
