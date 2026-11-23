/**
 * Dev-only filter for console noise we cannot fix inside this repo:
 *
 * - React DevTools tip — baked into react-dom development builds
 * - THREE.Clock deprecation — R3F 9 still constructs Clock; Timer lands in R3F 10
 * - beforeinstallprompt banner — Chrome logs when we defer prompt() to the
 *   parent-area install button (intentional PWA UX)
 *
 * Production builds never load these messages (minified react-dom, no Vite
 * client overlay). Keep the filter narrow so real warnings still surface.
 */
const QUIET: readonly RegExp[] = [
  /Download the React DevTools/i,
  /THREE\.Clock: This module has been deprecated/i,
  /Banner not shown: beforeinstallpromptevent\.preventDefault/i,
];

function shouldQuiet(args: readonly unknown[]): boolean {
  const text = args.map((arg) => (typeof arg === 'string' ? arg : '')).join(' ');
  return QUIET.some((pattern) => pattern.test(text));
}

function wrap(method: 'log' | 'info' | 'warn'): void {
  const original = console[method].bind(console);
  console[method] = (...args: unknown[]) => {
    if (shouldQuiet(args)) return;
    original(...args);
  };
}

if (import.meta.env.DEV) {
  wrap('log');
  wrap('info');
  wrap('warn');
}
