export type ParsedArrayElementHandle = { baseId: string; index: number };

// Handle syntax: <baseId>__<index>
// Example: inArr__2
export const parseArrayElementHandle = (
  handleId?: string | null
): ParsedArrayElementHandle | null => {
  if (!handleId) return null;
  const match = /^(.+?)__(\d+)$/.exec(handleId);
  if (!match) return null;
  const baseId = match[1];
  const index = Number(match[2]);
  if (!Number.isFinite(index)) return null;
  return { baseId, index };
};

export const isArrayTypeString = (type?: string | null): boolean =>
  typeof type === 'string' && type.endsWith('[]');

export const getArrayElementTypeString = (arrayType?: string | null): string | null => {
  if (!arrayType) return null;
  if (!isArrayTypeString(arrayType)) return null;
  return arrayType.slice(0, -2);
};
