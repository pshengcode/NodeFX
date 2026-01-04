import type { GLSLType, UniformVal, UniformValueType } from '../types';

const getArrayVecSize = (type: GLSLType): number => {
  if (type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]') return 1;
  if (type === 'vec2[]') return 2;
  if (type === 'vec3[]') return 3;
  if (type === 'vec4[]') return 4;
  return 1;
};

export const isArrayType = (type: GLSLType): boolean => typeof type === 'string' && type.endsWith('[]');

export const inferArrayLenFromValue = (type: GLSLType, val: UniformValueType): number => {
  const vecSize = getArrayVecSize(type);
  if (Array.isArray(val)) return val.length;
  if (val instanceof Float32Array) return vecSize === 1 ? val.length : Math.floor(val.length / vecSize);
  if (val instanceof Uint32Array) return vecSize === 1 ? val.length : Math.floor(val.length / vecSize);
  if (val instanceof Int32Array) return vecSize === 1 ? val.length : Math.floor(val.length / vecSize);
  return 0;
};

export const resolveArrayLen = (type: GLSLType, uniform?: UniformVal | null, fallback = 16): number => {
  const cfgLen = uniform?.widgetConfig?.arrayLength;
  const cfg = typeof cfgLen === 'number' && Number.isFinite(cfgLen) ? Math.round(cfgLen) : 0;
  if (cfg >= 1) return cfg;

  const inferred = uniform ? inferArrayLenFromValue(type, uniform.value) : 0;
  if (inferred >= 1) return inferred;

  return Math.max(1, Math.round(fallback));
};

const buildPaddedFloat32Array = (src: ArrayLike<number>, outLen: number) => {
  const out = new Float32Array(outLen);
  const n = Math.min(outLen, src.length);
  for (let i = 0; i < n; i++) {
    const v = Number((src as any)[i]);
    out[i] = Number.isFinite(v) ? v : 0;
  }
  return out;
};

const buildPaddedInt32Array = (src: ArrayLike<any>, outLen: number, mode: 'int' | 'bool') => {
  const out = new Int32Array(outLen);
  const srcLen = typeof (src as any)?.length === 'number' ? (src as any).length : 0;
  const n = Math.min(outLen, srcLen);
  for (let i = 0; i < n; i++) {
    const v = (src as any)[i];
    if (mode === 'bool') {
      out[i] = v ? 1 : 0;
    } else {
      const num = Number(v);
      out[i] = Number.isFinite(num) ? (num | 0) : 0;
    }
  }
  return out;
};

const buildPaddedUint32Array = (src: ArrayLike<any>, outLen: number) => {
  const out = new Uint32Array(outLen);
  const srcLen = typeof (src as any)?.length === 'number' ? (src as any).length : 0;
  const n = Math.min(outLen, srcLen);
  for (let i = 0; i < n; i++) {
    const num = Number((src as any)[i]);
    out[i] = Number.isFinite(num) ? (num >>> 0) : 0;
  }
  return out;
};

const isNumberArray = (v: unknown): v is number[] => {
  if (!Array.isArray(v)) return false;
  return v.every((x) => typeof x === 'number');
};

export const getUniformValue = (type: GLSLType, val: UniformValueType, arrayLen?: number) => {
  if (type === 'vec3' && isNumberArray(val)) return new Float32Array(val);
  if (type === 'vec4' && isNumberArray(val)) return new Float32Array(val);
  if (type === 'vec2' && isNumberArray(val)) return new Float32Array(val);
  if (type === 'uvec3' && isNumberArray(val)) return new Uint32Array(val);
  if (type === 'uvec4' && isNumberArray(val)) return new Uint32Array(val);
  if (type === 'uvec2' && isNumberArray(val)) return new Uint32Array(val);
  if ((type === 'mat2' || type === 'mat3' || type === 'mat4') && isNumberArray(val)) return new Float32Array(val);

  if (type === 'float[]') {
    const len = Math.max(
      1,
      typeof arrayLen === 'number' && Number.isFinite(arrayLen) ? Math.round(arrayLen) : inferArrayLenFromValue(type, val) || 16
    );
    if (Array.isArray(val)) return buildPaddedFloat32Array(val as number[], len);
    if (val instanceof Float32Array) return buildPaddedFloat32Array(val, len);
    return new Float32Array(len);
  }

  if (type === 'int[]') {
    const len = Math.max(
      1,
      typeof arrayLen === 'number' && Number.isFinite(arrayLen) ? Math.round(arrayLen) : inferArrayLenFromValue(type, val) || 16
    );
    if (Array.isArray(val)) return buildPaddedInt32Array(val as any, len, 'int');
    if (val instanceof Int32Array) return buildPaddedInt32Array(val, len, 'int');
    if (val && typeof val === 'object' && typeof (val as any).length === 'number') return buildPaddedInt32Array(val as any, len, 'int');
    return new Int32Array(len);
  }

  if (type === 'uint[]') {
    const len = Math.max(
      1,
      typeof arrayLen === 'number' && Number.isFinite(arrayLen) ? Math.round(arrayLen) : inferArrayLenFromValue(type, val) || 16
    );
    if (Array.isArray(val)) return buildPaddedUint32Array(val as any, len);
    if (val instanceof Uint32Array) return buildPaddedUint32Array(val, len);
    if (val && typeof val === 'object' && typeof (val as any).length === 'number') return buildPaddedUint32Array(val as any, len);
    return new Uint32Array(len);
  }

  if (type === 'bool[]') {
    const len = Math.max(
      1,
      typeof arrayLen === 'number' && Number.isFinite(arrayLen) ? Math.round(arrayLen) : inferArrayLenFromValue(type, val) || 16
    );
    if (Array.isArray(val)) return buildPaddedInt32Array(val as any, len, 'bool');
    if (val instanceof Int32Array) return buildPaddedInt32Array(val, len, 'bool');
    if (val && typeof val === 'object' && typeof (val as any).length === 'number') return buildPaddedInt32Array(val as any, len, 'bool');
    return new Int32Array(len);
  }

  if (type === 'vec2[]' || type === 'vec3[]' || type === 'vec4[]') {
    const vecSize = getArrayVecSize(type);
    const len = Math.max(
      1,
      typeof arrayLen === 'number' && Number.isFinite(arrayLen) ? Math.round(arrayLen) : inferArrayLenFromValue(type, val) || 16
    );
    const outLen = len * vecSize;

    if (Array.isArray(val)) {
      if (val.length > 0 && Array.isArray((val as any)[0])) {
        const out = new Float32Array(outLen);
        const arr = val as any[];
        const n = Math.min(len, arr.length);
        for (let i = 0; i < n; i++) {
          const row = Array.isArray(arr[i]) ? arr[i] : [];
          for (let j = 0; j < vecSize; j++) {
            const v = Number(row[j]);
            out[i * vecSize + j] = Number.isFinite(v) ? v : 0;
          }
        }
        return out;
      }
      return buildPaddedFloat32Array(val as any, outLen);
    }

    if (val instanceof Float32Array) return buildPaddedFloat32Array(val, outLen);
    return new Float32Array(outLen);
  }

  return val;
};
