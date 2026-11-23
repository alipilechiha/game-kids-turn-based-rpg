import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// React 19 + createRoot: without this flag, act() logs
// "The current testing environment is not configured to support act(...)".
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no WebGL — return null for WebGL contexts so WorldCanvas mounts
// do not spam "Not implemented: HTMLCanvasElement's getContext()".
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  type: string,
  options?: unknown,
) {
  if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
  return originalGetContext.call(this, type as '2d', options as CanvasRenderingContext2DSettings);
} as typeof HTMLCanvasElement.prototype.getContext;

// three@0.186 emits THREE_CJS_DEPRECATED once per worker under Vitest CJS interop.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const code =
    typeof rest[0] === 'string' && typeof rest[1] === 'string'
      ? rest[1]
      : typeof rest[0] === 'object' && rest[0] !== null && 'code' in rest[0]
        ? String((rest[0] as { code?: string }).code ?? '')
        : '';
  const text = typeof warning === 'string' ? warning : warning.message;
  if (code === 'THREE_CJS_DEPRECATED' || text.includes('THREE_CJS_DEPRECATED')) return;
  return (originalEmitWarning as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;
