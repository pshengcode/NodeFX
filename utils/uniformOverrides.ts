import { Node } from 'reactflow';
import { GLSLType, NodeData, RawTextureData, UniformVal, UniformValueType } from '../types';
import { getUniformValue, isArrayType, resolveArrayLen } from './arrayUniforms';
import { sanitizeGLSLType } from './glslTypeUtils';
import { generateCurveTexture, generateGradientTexture } from './textureGen';

const sanitizeType = (type: string): GLSLType => {
  return sanitizeGLSLType(type);
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
  const arrayLen = isArrayType(safeType) ? resolveArrayLen(safeType, uniform, 16) : undefined;

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

  return getUniformValue(safeType, uniform.value, arrayLen);
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

  const clampInt = (v: number, min: number, max: number) => {
    const vv = Math.round(v);
    if (!Number.isFinite(vv)) return min;
    return Math.max(min, Math.min(max, vv));
  };

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

      const uniformForLen: UniformVal = node.data.uniforms?.value
        ? { ...node.data.uniforms.value, type, value: value ?? null }
        : { type, value: value ?? null };
      const arrayLen = isArrayType(type) ? resolveArrayLen(type, uniformForLen, 16) : undefined;

      overrides[name] = {
        type,
        value: getUniformValue(type, value ?? 0, arrayLen),
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

      // Scheme B: ALL array inputs expose an implicit int uniform: u_<nodeId>_<inputId>_index
      // This allows using <inputId>_index in GLSL, and updating index without recompiling the shader
      // when a UI/editor provides a way to change widgetConfig.arrayIndex.
      if (isArrayType(safeType)) {
        const len = resolveArrayLen(safeType, uVal, 16);
        const maxIndex = Math.max(0, len - 1);
        const rawIdx = uVal.widgetConfig?.arrayIndex;
        const idx = typeof rawIdx === 'number' && Number.isFinite(rawIdx) ? rawIdx : 0;
        overrides[`${uniformName}_index`] = {
          type: 'int',
          value: clampInt(idx, 0, maxIndex),
        };
      }
    }
  }

  return overrides;
}
