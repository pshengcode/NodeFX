import type { GLSLType } from '../types';
import { GLSL_TYPE_STRINGS } from '../enums';

export { GLSL_TYPE_STRINGS };

export const isGLSLTypeString = (type: unknown): type is GLSLType =>
  typeof type === 'string' && (GLSL_TYPE_STRINGS as readonly string[]).includes(type);

export const sanitizeGLSLType = (type: unknown): GLSLType => {
  if (type === 'vec1') return 'float';
  return isGLSLTypeString(type) ? type : 'float';
};
