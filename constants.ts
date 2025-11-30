
import { GLSLType } from './types';

export const DEFAULT_VERTEX_SHADER = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

// Unified Color Palette for Types (Hex values for SVG support)
export const TYPE_COLORS: Record<GLSLType, string> = {
  float: '#3b82f6',    // blue-500
  int: '#1d4ed8',      // blue-700
  vec2: '#22c55e',     // green-500
  vec3: '#a855f7',     // purple-500
  vec4: '#ec4899',     // pink-500
  sampler2D: '#f97316' // orange-500
};

export const GLSL_BUILTINS = new Set([
  'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 
  'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 
  'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp', 
  'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross', 
  'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult', 
  'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 
  'equal', 'notEqual', 'any', 'all', 'not', 'texture', 'texture2D', 
  'textureLod', 'textureProj', 'dFdx', 'dFdy', 'fwidth',
  'main', 'run' // run is handled specially, main is reserved
]);
