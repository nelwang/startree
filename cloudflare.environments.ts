export const environments = {
  local: {
    name: 'startree-local',
    databaseName: 'startree-local',
    databaseId: '00000000-0000-4000-8000-000000000020',
    namespace: '10020',
  },
  preview: {
    name: 'startree-preview',
    databaseName: 'startree-preview',
    databaseId: '00000000-0000-4000-8000-000000000021',
    namespace: '20020',
  },
  production: {
    name: 'startree',
    databaseName: 'startree-production',
    databaseId: '00000000-0000-4000-8000-000000000022',
    namespace: '30020',
  },
} as const;

export function getEnvironment(mode: string | undefined) {
  if (mode !== 'local' && mode !== 'preview' && mode !== 'production') {
    throw new Error('Select an explicit Cloudflare mode: local, preview, or production.');
  }
  return environments[mode];
}
