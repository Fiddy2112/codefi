import path from 'path';
import fs from 'fs';

/**
 * Use a delimiter-aware check instead of an inclusive string ('dist')
 * Avoid false positives when the project is in a directory containing the word 'dist'
 * e.g. /home/distributor/codefi will not be mistakenly recognized as bundled
 *
 * Logic: if __dirname ends with /dist or /dist/..., it is bundled
 */
const distSegment = `${path.sep}dist`;

export const isBundled: boolean = (() => {
  const segments = __dirname.split(path.sep);
  // Bundled if there is a segment named 'dist' AFTER the project root
  // Simple and reliable way: check if package.json is at '../..' of __dirname
  // If bundled: __dirname = .../dist/services or .../dist/utils
  //              package.json at .../dist/../package.json = .../package.json  ✓
  // If dev:    __dirname = .../src/services
  //              package.json at .../src/../../package.json (will not exist there)
  //
  // Cách chắc nhất: check xem có file sentinel trong dist hay không
  const distDir = path.resolve(__dirname, '..', '..');
  const hasSrcSibling = fs.existsSync(path.join(distDir, 'src'));
  const hasDistInPath = segments.some(
    (seg, i) => seg === 'dist' && i > 0 && segments[i - 1] !== '' // not root
  );

  return hasDistInPath && !hasSrcSibling;
})();

/**
 * Resolves path to the assets directory.
 * - Production (dist/): <pkg-root>/dist/assets/...
 * - Development (src/):  <pkg-root>/assets/...
 */
export function getAssetsPath(...subPaths: string[]): string {
  const base = isBundled
    ? path.resolve(__dirname, '..', 'assets')      // dist/utils → dist/assets
    : path.resolve(__dirname, '..', '..', 'assets'); // src/utils → assets

  return path.join(base, ...subPaths);
}

/**
 * Resolves path to the internal scripts directory.
 * - Production (dist/): <pkg-root>/dist/scripts/...
 * - Development (src/):  <pkg-root>/scripts/...
 */
export function getInternalScriptPath(...subPaths: string[]): string {
  const base = isBundled
    ? path.resolve(__dirname, '..', 'scripts')       // dist/utils → dist/scripts
    : path.resolve(__dirname, '..', '..', 'scripts'); // src/utils → scripts

  return path.join(base, ...subPaths);
}

/**
 * Same as getAssetsPath but throws if the resolved path doesn't exist.
 * Use when the file must be present (e.g. player.py at startup).
 */
export function requireAssetsPath(...subPaths: string[]): string {
  const resolved = getAssetsPath(...subPaths);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Required asset not found: ${resolved}\n` +
      `(isBundled=${isBundled}, __dirname=${__dirname})`
    );
  }
  return resolved;
}

/**
 * Same as getInternalScriptPath but throws if not found.
 */
export function requireScriptPath(...subPaths: string[]): string {
  const resolved = getInternalScriptPath(...subPaths);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Required script not found: ${resolved}\n` +
      `(isBundled=${isBundled}, __dirname=${__dirname})`
    );
  }
  return resolved;
}