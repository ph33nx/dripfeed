declare const Bun: unknown;
declare const Deno: unknown;

export const isBun = typeof globalThis !== 'undefined' && 'Bun' in globalThis;
export const isDeno = typeof globalThis !== 'undefined' && 'Deno' in globalThis;
export const isNode = !isBun && !isDeno;
