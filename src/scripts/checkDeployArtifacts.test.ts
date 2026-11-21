import { describe, expect, it } from 'vitest';
import { isForbiddenDeployArtifact } from '../../scripts/deploy-artifacts.ts';

describe('isForbiddenDeployArtifact', () => {
  it.each([
    'waypoint-rpg-core-0.1.0.tgz',
    'framework.tar',
    'framework.tar.gz',
    'assets/index.d.ts',
    'assets/index.d.mts',
    'assets/index.d.cts',
    'assets/index.d.ts.map',
    'assets\\index.d.ts',
    'packages/core/dist/index.js',
    'examples/hello-world/index.html',
    'core-consumer/src/main.ts',
    'fixtures/consumer/package.json',
    'nested/package-lock.json',
  ])('rejects %s', (file) => {
    expect(isForbiddenDeployArtifact(file)).toBe(true);
  });

  it.each(['index.html', 'assets/index-abc.js', 'models/kid.glb', 'audio/theme.mp3'])(
    'allows %s',
    (file) => {
      expect(isForbiddenDeployArtifact(file)).toBe(false);
    },
  );
});
