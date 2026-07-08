/**
 * Re-export of the shared clone walker (promoted to `_shared/clone-walk.ts`
 * so other modules — e.g. `context`'s discovery — can reuse the same
 * bounded/symlink-skipping walker without cross-importing repo-intel
 * internals). Kept here so existing `./walk.js` imports (and tests) are
 * unaffected. Behavior is byte-identical: `walkClone(root)` without options
 * defaults to repo-intel's own SUPPORTED_EXT.
 */
export { walkClone, type WalkOptions, type WalkResult, type WalkStats } from '../../_shared/clone-walk.js';
