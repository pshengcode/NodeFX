import { Node } from 'reactflow';
import { GLSLType, NodeData, RawTextureData, UniformVal, UniformValueType } from '../types';
import { generateCurveTexture, generateGradientTexture } from './textureGen';

const sanitizeType = (type: string): GLSLType => {
  if (type === 'vec1') return 'float';
  const validTypes: GLSLType[] = [
    'float',
    'int',
    'bool',
    'uint',
    'vec2',
    'vec3',
    'vec4',
    'uvec2',
    'uvec3',
    'uvec4',
    'mat2',
    'mat3',
    'mat4',
    'sampler2D',
    'samplerCube',
    'vec2[]',
  ];
  return (validTypes as string[]).includes(type) ? (type as GLSLType) : 'float';
};

const getUniformValue = (type: GLSLType, val: UniformValueType) => {
  if (type === 'vec3' && Array.isArray(val)) return new Float32Array(val);
  if (type === 'vec4' && Array.isArray(val)) return new Float32Array(val);
  if (type === 'vec2' && Array.isArray(val)) return new Float32Array(val);
  if (type === 'uvec3' && Array.isArray(val)) return new Uint32Array(val);
  if (type === 'uvec4' && Array.isArray(val)) return new Uint32Array(val);
  if (type === 'uvec2' && Array.isArray(val)) return new Uint32Array(val);
  if ((type === 'mat2' || type === 'mat3' || type === 'mat4') && Array.isArray(val)) return new Float32Array(val);
  if (type === 'vec2[]' && Array.isArray(val)) return new Float32Array(val.flat() as number[]);
  return val;
};

const sampleCenterRGBA = (textureData: RawTextureData) => {
  const w = textureData.width;
  const centerIdx = Math.floor(w / 2) * 4;
  const r = textureData.data[centerIdx] / 255;
  const g = textureData.data[centerIdx + 1] / 255;
  const b = textureData.data[centerIdx + 2] / 255;
  const a = textureData.data[centerIdx + 3] / 255;
  return { r, g, b, a };
};

const readAlphaFromUniformValue = (val: UniformValueType): number | null => {
  if (val instanceof Float32Array && val.length >= 4) return val[3] ?? null;
  if (Array.isArray(val) && val.length >= 4) {
    const a = val[3];
    return typeof a === 'number' ? a : null;
  }
  return null;
};

const buildOneUniformValue = (node: Node<NodeData>, uniform: UniformVal) => {
  const safeType = sanitizeType(uniform.type);

  // Gradient/Curve widgets synthesize textures from widgetConfig.
  if (uniform.widget === 'gradient' || uniform.widget === 'curve') {
    const w = node.data.resolution?.w || 512;

    let textureData: RawTextureData | null = null;
    if (uniform.widget === 'gradient' && uniform.widgetConfig?.gradientStops) {
      textureData = generateGradientTexture(uniform.widgetConfig.gradientStops, w, uniform.widgetConfig.alphaStops);
    } else if (uniform.widget === 'curve' && uniform.widgetConfig?.curvePoints) {
      textureData = generateCurveTexture(
        uniform.widgetConfig.curvePoints,
        w,
        uniform.widgetConfig.curvePointsR,
        uniform.widgetConfig.curvePointsG,
        uniform.widgetConfig.curvePointsB,
        uniform.widgetConfig.curvePointsA,
      );
    }

    if (safeType === 'sampler2D') {
      return textureData ?? uniform.value;
    }

    // Back-compat behavior: for scalar/vector uniforms driven by gradient/curve,
    // sample the center pixel.
    if (textureData && (safeType === 'float' || safeType === 'vec3' || safeType === 'vec4')) {
      const { r, g, b, a } = sampleCenterRGBA(textureData);
      if (safeType === 'vec4') {
        // Curve editor currently has no A channel; preserve existing alpha for curve-driven vec4.
        const preservedAlpha = uniform.widget === 'curve' ? readAlphaFromUniformValue(uniform.value) : null;
        return new Float32Array([r, g, b, preservedAlpha ?? a]);
      }
      if (safeType === 'vec3') return new Float32Array([r, g, b]);
      return r;
    }
  }

  return getUniformValue(safeType, uniform.value);
};

const isRawTextureData = (val: unknown): val is RawTextureData => {
  return !!val && typeof val === 'object' && (val as any).isRaw === true;
};

/**
 * Builds a uniform override map keyed by the EXACT GLSL uniform names used in compiled shaders.
 * This allows updating uniform values without regenerating shader code.
 */
export function buildUniformOverridesFromNodes(nodes: Node<NodeData>[]): Record<string, UniformVal> {
  const overrides: Record<string, UniformVal> = {};

  for (const node of nodes) {
    const nodeIdClean = node.id.replace(/-/g, '_');

    // Global variable nodes are exposed as uniforms.
    if (node.data.isGlobalVar) {
      const name = node.data.globalName || `u_global_${nodeIdClean}`;
      const type = sanitizeType(node.data.outputType || 'float');

      let value: UniformValueType = node.data.value;
      if (value === undefined && node.data.uniforms?.value) {
        value = node.data.uniforms.value.value;
      }

      overrides[name] = {
        type,
        value: getUniformValue(type, value ?? 0),
      };
      continue;
    }

    // Standard node input uniforms.
    for (const input of node.data.inputs || []) {
      const uVal = node.data.uniforms?.[input.id];
      if (!uVal) continue;

      const uniformName = `u_${nodeIdClean}_${input.id}`;
      const safeType = sanitizeType(uVal.type);
      let value = buildOneUniformValue(node, uVal);

      // Prevent texture cache blow-up when dragging gradient/curve widgets:
      // keep a stable texture id per node+input, and rely on WebGL to re-upload.
      if (safeType === 'sampler2D' && (uVal.widget === 'gradient' || uVal.widget === 'curve')) {
        const w = node.data.resolution?.w || 512;
        const stableId = `widget_${nodeIdClean}_${input.id}_${w}`;
        if (isRawTextureData(value)) {
          value = { ...value, id: stableId };
        } else if (isRawTextureData(uVal.value)) {
          value = { ...uVal.value, id: stableId };
        }
      }

      overrides[uniformName] = {
        ...uVal,
        type: safeType,
        value,
      };
    }
  }

  return overrides;
}
