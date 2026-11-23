export const MODEL_ASSET_SCHEMA_VERSION = 1 as const;

export const MODEL_IMPORT_BUDGET = Object.freeze({
  maxFileBytes: 12 * 1024 * 1024,
  maxTriangles: 60_000,
  maxTextureDimension: 2048,
  maxDecodedTextureBytes: 24 * 1024 * 1024,
  maxJoints: 64,
  maxClips: 16,
  maxClipSeconds: 180,
});

export type SemanticAction = 'idle' | 'move' | 'interact' | 'combat' | 'defeat';
export type RuntimeModelFormat = 'glb' | 'gltf';

export interface ModelAssetRights {
  readonly licenseId: string;
  readonly attribution: string;
  readonly commercialUse: boolean;
  readonly redistribution: boolean;
  readonly approved: boolean;
}

export interface ModelAssetRecord {
  readonly schemaVersion: typeof MODEL_ASSET_SCHEMA_VERSION;
  readonly id: string;
  readonly runtimePath: string;
  readonly runtimeFormat: RuntimeModelFormat;
  readonly sourceFormat: string;
  readonly sourceOrigin: string;
  readonly sourceSha256: string;
  readonly outputSha256: string;
  readonly importer: string;
  readonly importerVersion: string;
  readonly rights: ModelAssetRights;
  readonly normalization: {
    readonly metersPerUnit: number;
    readonly upAxis: 'Y';
    readonly forwardAxis: '-Z';
  };
  readonly bounds: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly triangles: number;
  readonly textureBytes: number;
  readonly jointCount: number;
  readonly clips: Readonly<Record<string, string>>;
  readonly fallbackAction: 'idle' | 'static';
}

export interface ModelAssetDiagnostic {
  readonly path: string;
  readonly message: string;
}

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACTIONS: readonly SemanticAction[] = ['idle', 'move', 'interact', 'combat', 'defeat'];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteTuple(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
  );
}

export function validateModelAssetRecord(value: unknown): readonly ModelAssetDiagnostic[] {
  const errors: ModelAssetDiagnostic[] = [];
  const issue = (path: string, message: string) => errors.push({ path, message });
  if (!record(value)) return [{ path: '$', message: 'Expected a JSON object.' }];

  if (value.schemaVersion !== MODEL_ASSET_SCHEMA_VERSION)
    issue('schemaVersion', 'Unsupported model asset schema version.');
  if (typeof value.id !== 'string' || !SAFE_ID.test(value.id))
    issue('id', 'Use a stable lowercase kebab-case asset ID.');
  if (
    typeof value.runtimePath !== 'string' ||
    !/^models\/[a-zA-Z0-9._/-]+\.(glb|gltf)$/.test(value.runtimePath) ||
    value.runtimePath.includes('..')
  )
    issue('runtimePath', 'Use a local models/ path without traversal.');
  if (value.runtimeFormat !== 'glb' && value.runtimeFormat !== 'gltf')
    issue('runtimeFormat', 'Runtime format must be glb or gltf.');
  if (typeof value.sourceFormat !== 'string' || value.sourceFormat.length === 0)
    issue('sourceFormat', 'Record the original source format.');
  if (typeof value.sourceOrigin !== 'string' || value.sourceOrigin.length === 0)
    issue('sourceOrigin', 'Record a source URL, provider, or generated fixture origin.');
  for (const key of ['sourceSha256', 'outputSha256'] as const) {
    if (typeof value[key] !== 'string' || !SHA256.test(value[key]))
      issue(key, 'Record the lowercase SHA-256 digest.');
  }
  for (const key of ['importer', 'importerVersion'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0)
      issue(key, 'Record the tool and version used to produce the runtime file.');
  }

  if (!record(value.rights)) {
    issue('rights', 'Record license and redistribution rights.');
  } else {
    if (typeof value.rights.licenseId !== 'string' || value.rights.licenseId.length === 0)
      issue('rights.licenseId', 'Record the applicable license or ownership terms.');
    if (typeof value.rights.attribution !== 'string')
      issue(
        'rights.attribution',
        'Record attribution, including an empty string when not required.',
      );
    for (const key of ['commercialUse', 'redistribution', 'approved'] as const) {
      if (typeof value.rights[key] !== 'boolean') issue(`rights.${key}`, 'Expected a boolean.');
    }
    if (value.rights.approved !== true)
      issue('rights.approved', 'Unapproved assets cannot be used by the release consumer.');
  }

  if (!record(value.normalization)) {
    issue('normalization', 'Record the normalized coordinate convention.');
  } else {
    if (
      typeof value.normalization.metersPerUnit !== 'number' ||
      !Number.isFinite(value.normalization.metersPerUnit) ||
      value.normalization.metersPerUnit <= 0
    )
      issue('normalization.metersPerUnit', 'Expected a positive finite scale.');
    if (value.normalization.upAxis !== 'Y')
      issue('normalization.upAxis', 'Runtime up axis must be Y.');
    if (value.normalization.forwardAxis !== '-Z')
      issue('normalization.forwardAxis', 'Runtime forward axis must be -Z.');
  }

  const bounds = value.bounds;
  const boundsMin = record(bounds) ? bounds.min : undefined;
  const boundsMax = record(bounds) ? bounds.max : undefined;
  if (!finiteTuple(boundsMin) || !finiteTuple(boundsMax)) {
    issue('bounds', 'Expected finite three-dimensional minimum and maximum bounds.');
  } else if (boundsMin.some((coordinate, index) => coordinate > boundsMax[index]!)) {
    issue('bounds', 'Each minimum coordinate must be less than or equal to its maximum.');
  }

  const boundedInteger = (key: 'triangles' | 'textureBytes' | 'jointCount', maximum: number) => {
    const count = value[key];
    if (!Number.isSafeInteger(count) || (count as number) < 0 || (count as number) > maximum)
      issue(key, `Expected a non-negative integer no greater than ${maximum}.`);
  };
  boundedInteger('triangles', MODEL_IMPORT_BUDGET.maxTriangles);
  boundedInteger('textureBytes', MODEL_IMPORT_BUDGET.maxDecodedTextureBytes);
  boundedInteger('jointCount', MODEL_IMPORT_BUDGET.maxJoints);

  if (!record(value.clips)) {
    issue('clips', 'Expected a semantic-action to source-clip mapping.');
  } else {
    for (const [action, clip] of Object.entries(value.clips)) {
      if (!ACTIONS.includes(action as SemanticAction))
        issue(`clips.${action}`, 'Unknown semantic action.');
      if (typeof clip !== 'string' || clip.length === 0)
        issue(`clips.${action}`, 'Clip names must be non-empty strings.');
    }
  }
  if (value.fallbackAction !== 'idle' && value.fallbackAction !== 'static')
    issue('fallbackAction', 'Fallback must be idle or static.');
  return errors;
}

export function resolveSemanticClip(
  record: Pick<ModelAssetRecord, 'clips' | 'fallbackAction'>,
  action: SemanticAction,
): string | null {
  return record.clips[action] ?? record.clips.idle ?? null;
}
