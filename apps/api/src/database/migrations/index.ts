import { InitialSchema1790380800000 } from './1790380800000-initial-schema';

/**
 * Ordered list of migrations (I-15: explicit classes, no globs). New code is published before
 * `migrate` runs, so every migration must be backward compatible: expand first, contract later (I-16).
 */
export const MIGRATIONS = [InitialSchema1790380800000];
