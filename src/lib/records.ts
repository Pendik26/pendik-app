// Saved progress (card states, the study log, sync bookkeeping) stays in plain objects because it
// is stored and synced as JSON. Its keys come from content ids, dates and synced data, so it is
// read and written through these: only the object's own keys count, never "constructor" or
// "__proto__" inherited from Object.prototype, and writing "__proto__" can't swap the prototype.

/** The record's own value under `key`, or undefined when it has none. */
export function own<K extends string, T>(record: Readonly<Partial<Record<K, T>>>, key: K): T | undefined {
  return Object.hasOwn(record, key) ? (Reflect.get(record, key) as T | undefined) : undefined;
}

/** Sets `key` as the record's own property. */
export function setOwn<K extends string, T>(record: Partial<Record<K, T>>, key: K, value: T): void {
  Object.defineProperty(record, key, { value, writable: true, enumerable: true, configurable: true });
}

/** Removes the record's own `key`. */
export function deleteOwn<K extends string>(record: Partial<Record<K, unknown>>, key: K): void {
  if (Object.hasOwn(record, key)) Reflect.deleteProperty(record, key);
}

/** A fixed table's entry for one of its keys: for exhaustive tables, where every key has one. */
export function entry<K extends string, T>(table: Readonly<Record<K, T>>, key: K): T {
  if (!Object.hasOwn(table, key)) throw new RangeError(`No entry for "${key}"`);
  return Reflect.get(table, key) as T;
}
