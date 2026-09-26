export interface JsonObject {
  readonly [key: string]: Json | undefined;
}
export type Json = null | boolean | number | string | readonly Json[] | JsonObject;

const sortKeys = (value: Json | undefined): Json | undefined => {
  if (Array.isArray(value)) {
    return (value as readonly (Json | undefined)[]).map((item) => sortKeys(item) ?? null);
  }
  if (value === null || typeof value !== 'object') return value;
  const record = value as JsonObject;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, sortKeys(record[key])]),
  );
};

/** Deterministic JSON: object keys sorted at every depth, `undefined` properties dropped. */
export const canonicalJson = (value: Json): string => JSON.stringify(sortKeys(value));
