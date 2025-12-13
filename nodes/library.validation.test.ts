import { describe, it, expect } from 'vitest';
import { ShaderNodeDefinitionSchema } from '../utils/schemas';
import { extractAllSignatures, extractShaderIO } from '../utils/glslParser';
import type { GLSLType, ShaderNodeData } from '../types';

type LoadedNodeModule = { default?: unknown } | unknown;

const libraryFiles = import.meta.glob('./library/*.json', { eager: true });

const toGlslString = (glsl: ShaderNodeData['glsl']): string => {
  if (Array.isArray(glsl)) return glsl.join('\n');
  return glsl;
};

const comparePortSets = (
  kind: 'inputs' | 'outputs',
  filePath: string,
  jsonPorts: Array<{ id: string; type: GLSLType; name: string }>,
  sigPorts: Array<{ id: string; type: GLSLType; name: string }>,
  errors: string[],
) => {
  const jsonById = new Map(jsonPorts.map(p => [p.id, p] as const));
  const sigById = new Map(sigPorts.map(p => [p.id, p] as const));

  for (const [id, p] of jsonById) {
    const sig = sigById.get(id);
    if (!sig) {
      errors.push(`${kind}: JSON has '${id}' but GLSL run() signature does not.`);
      continue;
    }
    if (sig.type !== p.type) {
      errors.push(`${kind}: '${id}' type mismatch (JSON=${p.type}, GLSL=${sig.type}).`);
    }
  }

  for (const [id] of sigById) {
    if (!jsonById.has(id)) {
      errors.push(`${kind}: GLSL run() signature has '${id}' but JSON does not.`);
    }
  }
};

const getEffectiveOutputs = (data: ShaderNodeData) => {
  const explicit = (data.outputs ?? []).filter(o => o && typeof o.id === 'string');
  if (explicit.length > 0) return explicit;
  if (data.outputType) {
    return [{ id: 'result', name: 'Result', type: data.outputType }];
  }
  return [] as Array<{ id: string; type: GLSLType; name: string }>;
};

const portsCoveredByOverloads = (
  jsonPorts: Array<{ id: string; type: GLSLType }>,
  sigs: Array<{ inputs: Array<{ id: string; type: GLSLType }>; outputs: Array<{ id: string; type: GLSLType }> }>,
  kind: 'inputs' | 'outputs',
) => {
  const jsonById = new Map(jsonPorts.map(p => [p.id, p.type] as const));
  const sigPortsAll = sigs.map(s => (kind === 'inputs' ? s.inputs : s.outputs));

  // 1) Every signature port must be present in JSON (so the UI can connect it)
  for (const ports of sigPortsAll) {
    for (const p of ports) {
      const jsonType = jsonById.get(p.id);
      if (!jsonType) return { ok: false, missingInJson: p.id };
      if (jsonType !== p.type) return { ok: false, typeMismatch: { id: p.id, json: jsonType, sig: p.type } };
    }
  }

  // 2) Every JSON port must exist in at least one signature (so it does something)
  for (const [id, t] of jsonById) {
    let found = false;
    for (const ports of sigPortsAll) {
      const match = ports.find(p => p.id === id);
      if (match && match.type === t) {
        found = true;
        break;
      }
    }
    if (!found) return { ok: false, missingInAnySig: id };
  }

  return { ok: true };
};

const findBestMatchingSignature = (
  jsonInputs: Array<{ id: string; type: GLSLType }>,
  jsonOutputs: Array<{ id: string; type: GLSLType }>,
  sigs: Array<{ inputs: Array<{ id: string; type: GLSLType }>; outputs: Array<{ id: string; type: GLSLType }> }>,
) => {
  const jsonIn = new Map(jsonInputs.map(p => [p.id, p.type] as const));
  const jsonOut = new Map(jsonOutputs.map(p => [p.id, p.type] as const));

  let bestIdx = -1;
  let bestScore = -1;
  let isPerfect = false;

  for (let idx = 0; idx < sigs.length; idx++) {
    const sig = sigs[idx];
    const sigIn = new Map(sig.inputs.map(p => [p.id, p.type] as const));
    const sigOut = new Map(sig.outputs.map(p => [p.id, p.type] as const));

    let score = 0;
    let exact = true;

    // Inputs
    for (const [id, t] of jsonIn) {
      if (!sigIn.has(id)) {
        exact = false;
        continue;
      }
      score += 2;
      if (sigIn.get(id) === t) score += 3;
      else exact = false;
    }
    for (const [id] of sigIn) {
      if (!jsonIn.has(id)) exact = false;
    }

    // Outputs
    for (const [id, t] of jsonOut) {
      if (!sigOut.has(id)) {
        exact = false;
        continue;
      }
      score += 2;
      if (sigOut.get(id) === t) score += 3;
      else exact = false;
    }
    for (const [id] of sigOut) {
      if (!jsonOut.has(id)) exact = false;
    }

    if (exact) {
      bestIdx = idx;
      isPerfect = true;
      break;
    }

    if (!isPerfect && score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  if (bestIdx < 0) return null;
  return { sig: sigs[bestIdx], isPerfect };
};

describe('Node Library (GLSL signature + i18n validation)', () => {
  it('ensures inputs/outputs/uniforms match GLSL run(...) and locale keys exist', () => {
    const allIssues: Array<{ path: string; issues: string[] }> = [];
    const allWarnings: Array<{ path: string; warnings: string[] }> = [];

    Object.entries(libraryFiles).forEach(([path, mod]: [string, LoadedNodeModule]) => {
      const nodeDef = (mod as any).default ?? mod;
      const parsed = ShaderNodeDefinitionSchema.safeParse(nodeDef);
      expect(parsed.success, `Schema should be valid for ${path}`).toBe(true);
      if (!parsed.success) return;

      const def = parsed.data;
      const glsl = toGlslString(def.data.glsl);
      const issues: string[] = [];
      const warnings: string[] = [];

      const isNonGlslNode =
        !glsl ||
        glsl.trim().length === 0 ||
        (def.data as any).isGlobalVar === true ||
        (def.data as any).isCompound === true;

      if (!isNonGlslNode) {
        const sigs = extractAllSignatures(glsl);
        if (sigs.length === 0) {
          issues.push(`GLSL: missing or unparsable 'void run(...)' signature.`);
        } else {
          const jsonInputs = def.data.inputs ?? [];
          const jsonOutputs = getEffectiveOutputs(def.data);

          const best = findBestMatchingSignature(jsonInputs, jsonOutputs, sigs);
          if (!best) {
            issues.push(`GLSL: missing or unparsable 'void run(...)' signature.`);
          } else if (best.isPerfect) {
            comparePortSets('inputs', path, jsonInputs, best.sig.inputs as any, issues);
            comparePortSets('outputs', path, jsonOutputs, best.sig.outputs as any, issues);
          } else {
            // Union-style overload interface: JSON ports can be a superset of any single signature,
            // but must be fully covered across all overloads.
            const inputCoverage = portsCoveredByOverloads(jsonInputs, sigs, 'inputs');
            const outputCoverage = portsCoveredByOverloads(jsonOutputs, sigs, 'outputs');
            const isUnionCompatible = inputCoverage.ok && outputCoverage.ok;

            if (!isUnionCompatible) {
              comparePortSets('inputs', path, jsonInputs, best.sig.inputs as any, issues);
              comparePortSets('outputs', path, jsonOutputs, best.sig.outputs as any, issues);
            } else {
              warnings.push(`GLSL: node ports look like a union across overloads (no single run() matches all ports).`);
            }
          }

          // uniforms: keys must map to an input id and types must match
          const uniforms = def.data.uniforms ?? {};
          const inputById = new Map(jsonInputs.map(i => [i.id, i] as const));
          for (const [uKey, uVal] of Object.entries(uniforms)) {
            const input = inputById.get(uKey);
            if (!input) {
              issues.push(`uniforms: key '${uKey}' has no matching input id.`);
            } else if (uVal.type !== input.type) {
              issues.push(`uniforms: '${uKey}' type mismatch (uniform=${uVal.type}, input=${input.type}).`);
            }
          }
        }
      }

      // locale keys: if locales exist, every locale should include keys for label + port names
      if (def.locales) {
        const requiredKeys = new Set<string>();
        requiredKeys.add(def.label);
        for (const i of def.data.inputs ?? []) requiredKeys.add(i.name);
        for (const o of def.data.outputs ?? []) requiredKeys.add(o.name);

        for (const [lang, table] of Object.entries(def.locales)) {
          for (const key of requiredKeys) {
            if (!(key in table)) {
              warnings.push(`locales.${lang}: missing key '${key}'.`);
            }
          }
        }
      }

      if (issues.length > 0) allIssues.push({ path, issues });
      if (warnings.length > 0) allWarnings.push({ path, warnings });
    });

    if (allIssues.length > 0) {
      const report = allIssues
        .map(({ path, issues }) => `\n- ${path}\n  ${issues.map(i => `• ${i}`).join('\n  ')}`)
        .join('');
      // Print a readable summary in the test output.
      // eslint-disable-next-line no-console
      console.error(`Node validation issues found:${report}\n`);
    }

    if (allWarnings.length > 0) {
      const report = allWarnings
        .map(({ path, warnings }) => `\n- ${path}\n  ${warnings.map(w => `• ${w}`).join('\n  ')}`)
        .join('');
      // eslint-disable-next-line no-console
      console.warn(`Node validation warnings:${report}\n`);
    }

    expect(allIssues.length, `No node definition issues expected`).toBe(0);
  });
});
