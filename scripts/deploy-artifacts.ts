const forbiddenArchive = /\.(?:tgz|tar(?:\.gz)?)$/i;
const forbiddenDeclaration = /\.d\.(?:ts|mts|cts)(?:\.map)?$/i;
const forbiddenDirectory = /(?:^|\/)(?:packages|examples|core-consumer|fixtures?)(?:\/|$)/i;
const forbiddenManifest = /(?:^|\/)(?:package\.json|package-lock\.json)$/i;

export function isForbiddenDeployArtifact(file: string): boolean {
  const normalized = file.replaceAll('\\', '/');
  return (
    forbiddenArchive.test(normalized) ||
    forbiddenDeclaration.test(normalized) ||
    forbiddenDirectory.test(normalized) ||
    forbiddenManifest.test(normalized)
  );
}
