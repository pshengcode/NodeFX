
import { Edge, Node } from 'reactflow';
import { NodeData, CompilationResult, GLSLType, RenderPass, UniformVal, NodeOutput, UniformValueType } from '../types';
import { DEFAULT_VERTEX_SHADER, GLSL_BUILTINS } from '../constants';
import { generateGradientTexture, generateCurveTexture } from './textureGen';
import { stripComments, extractShaderIO } from './glslParser';
import { parseArrayElementHandle } from './arrayHandles';
import { getUniformValue, inferArrayLenFromValue, isArrayType, resolveArrayLen } from './arrayUniforms';
import { sanitizeGLSLType } from './glslTypeUtils';


// Helper to sanitize types
const sanitizeType = (type: string): GLSLType => {
    return sanitizeGLSLType(type);
};

// Default values
const getDefaultGLSLValue = (type: GLSLType, arrayLen?: number): string => {
    const safeType = sanitizeType(type);
    const len = (() => {
        const n = typeof arrayLen === 'number' && Number.isFinite(arrayLen) ? Math.round(arrayLen) : 16;
        return Math.max(1, n);
    })();
    switch (safeType) {
    case 'float': return '0.0';
    case 'int': return '0';
    case 'uint': return '0u';
    case 'bool': return 'false';
    case 'vec2': return 'vec2(0.0)';
    case 'vec3': return 'vec3(0.0)';
    case 'vec4': return 'vec4(0.0, 0.0, 0.0, 1.0)';
    case 'uvec2': return 'uvec2(0u)';
    case 'uvec3': return 'uvec3(0u)';
    case 'uvec4': return 'uvec4(0u, 0u, 0u, 1u)';
    case 'mat2': return 'mat2(1.0)'; // Identity matrix
    case 'mat3': return 'mat3(1.0)';
    case 'mat4': return 'mat4(1.0)';
    case 'sampler2D': return 'u_empty_tex'; 
    case 'samplerCube': return 'u_empty_cube'; // We might need to define this uniform
    case 'float[]': {
                const zeros = Array(len).fill('0.0').join(', ');
                return `float[${len}](${zeros})`;
    }
    case 'int[]': {
                const zeros = Array(len).fill('0').join(', ');
                return `int[${len}](${zeros})`;
    }
    case 'uint[]': {
                const zeros = Array(len).fill('0u').join(', ');
                return `uint[${len}](${zeros})`;
    }
    case 'bool[]': {
                const zeros = Array(len).fill('false').join(', ');
                return `bool[${len}](${zeros})`;
    }
    case 'vec2[]': {
                const zeros = Array(len).fill('vec2(0.0)').join(', ');
                return `vec2[${len}](${zeros})`;
    }
    case 'vec3[]': {
                const zeros = Array(len).fill('vec3(0.0)').join(', ');
                return `vec3[${len}](${zeros})`;
    }
    case 'vec4[]': {
                const zeros = Array(len).fill('vec4(0.0)').join(', ');
                return `vec4[${len}](${zeros})`;
    }
    default: return '0.0';
  }
};

// Type Casting Logic
const castGLSLVariable = (varName: string, fromType: GLSLType, toType: GLSLType): string => {
    if (fromType === toType) return varName;
    
    // Bool conversions
    if (fromType === 'bool') {
        if (toType === 'int') return `int(${varName})`;
        if (toType === 'float') return `float(${varName})`;
    }
    if (toType === 'bool') {
        if (fromType === 'int') return `bool(${varName})`;
        if (fromType === 'float') return `bool(${varName})`;
    }

    if (fromType === 'float') {
        if (toType === 'vec2') return `vec2(${varName})`;
        if (toType === 'vec3') return `vec3(${varName})`;
        if (toType === 'vec4') return `vec4(vec3(${varName}), 1.0)`; 
        if (toType === 'int') return `int(${varName})`;
        if (toType === 'bool') return `bool(${varName})`;
    }
    if (fromType === 'int') {
        if (toType === 'float') return `float(${varName})`;
        if (toType === 'vec2') return `vec2(float(${varName}))`;
        if (toType === 'vec3') return `vec3(float(${varName}))`;
        if (toType === 'vec4') return `vec4(vec3(float(${varName})), 1.0)`;
        if (toType === 'bool') return `bool(${varName})`;
    }
    if (fromType === 'vec2') {
        if (toType === 'float') return `${varName}.x`;
        if (toType === 'vec3') return `vec3(${varName}, 0.0)`;
        if (toType === 'vec4') return `vec4(${varName}, 0.0, 1.0)`;
    }
    if (fromType === 'vec3') {
        if (toType === 'vec4') return `vec4(${varName}, 1.0)`;
        if (toType === 'float') return `${varName}.r`;
        if (toType === 'vec2') return `${varName}.xy`;
    }
    if (fromType === 'vec4') {
        if (toType === 'vec3') return `${varName}.rgb`;
        if (toType === 'float') return `${varName}.r`;
        if (toType === 'vec2') return `${varName}.xy`;
    }
    // Fallback constructor
    return `${toType}(${varName})`;
};

// Helper to generate function signature consistently
const generateFunctionSignature = (
    funcName: string, 
    inputs: { type: string; id: string }[] = [], 
    outputs: { type: string; id: string }[] = [],
    uniformsById?: Record<string, UniformVal>
): string => {
    const args = ['vec2 uv'];
    
    inputs.forEach(i => {
        if (i.type === 'float[]' || i.type === 'int[]' || i.type === 'uint[]' || i.type === 'bool[]' || i.type === 'vec2[]' || i.type === 'vec3[]' || i.type === 'vec4[]') {
            const safeType = sanitizeType(i.type);
            const base = safeType.replace('[]', '');
            const len = resolveArrayLen(safeType, uniformsById?.[i.id] || null, 16);
            args.push(`${base} ${i.id}[${len}]`);
            return;
        }
        args.push(`${i.type} ${i.id}`);
    });
    outputs.forEach(o => args.push(`out ${o.type} ${o.id}`));
    
    return `void ${funcName}(${args.join(', ')})`;
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Ensures that any array inputs in `void run(...)` have a concrete size matching the configured length.
 * This is required because GLSL array parameter sizes are part of the type.
 */
const rewriteRunArrayParamSizes = (
    code: string,
    inputs: { type: string; id: string }[] = [],
    uniformsById?: Record<string, UniformVal>
): string => {
    const runMatch = /\bvoid\s+run\s*\(/.exec(code);
    if (!runMatch) return code;

    const start = runMatch.index;
    const openParen = code.indexOf('(', start);
    if (openParen < 0) return code;

    // Find the matching close paren for the signature.
    let depth = 1;
    let i = openParen + 1;
    while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
    }
    if (depth !== 0) return code;

    const closeParen = i - 1;
    let sig = code.slice(start, closeParen + 1);

    for (const inp of inputs) {
        const safeType = sanitizeType(inp.type);
        if (safeType !== 'float[]' && safeType !== 'int[]' && safeType !== 'uint[]' && safeType !== 'bool[]' && safeType !== 'vec2[]' && safeType !== 'vec3[]' && safeType !== 'vec4[]') continue;

        const base = safeType.replace('[]', '');
        const len = resolveArrayLen(safeType, uniformsById?.[inp.id] || null, 16);

        const baseEsc = escapeRegex(base);
        const idEsc = escapeRegex(inp.id);
        const re = new RegExp(`(\\b${baseEsc}\\s+${idEsc}\\s*\\[)\\s*[^\\]]*\\s*(\\])`, 'g');
        sig = sig.replace(re, `$1${len}$2`);
    }

    return code.slice(0, start) + sig + code.slice(closeParen + 1);
};

// --- COMPOUND NODE COMPILER ---
export const compileCompoundNode = (
    compoundNode: Node<NodeData>,
    allNodes: Node<NodeData>[],
    allEdges: Edge[]
): string => {
    const scopeId = compoundNode.id;
    const innerNodes = allNodes.filter(n => n.data.scopeId === scopeId);
    
    // Find Input and Output nodes
    const inputNode = innerNodes.find(n => n.type === 'graphInput');
    const outputNode = innerNodes.find(n => n.type === 'graphOutput');
    
    let code = '';
    
    // 1. Generate Inner Functions (Recursively if needed)
    // We need to process nodes in dependency order to ensure functions are defined before use?
    // In GLSL, functions must be declared or defined before use.
    // However, we are generating a block of functions.
    // If we just generate all "node_ID_run" functions first, then the main "run" function, it works.
    // The order of "node_ID_run" functions doesn't matter unless they call each other?
    // Nodes don't call each other directly; the main "run" function calls them.
    // So order of definition of inner nodes doesn't matter.
    
    innerNodes.forEach(node => {
        if (node.type === 'graphInput' || node.type === 'graphOutput') return;
        if (node.data.isGlobalVar) return; // Global variables are handled as uniforms
        
        let nodeGlsl = node.data.glsl;
        if (node.data.isCompound) {
            nodeGlsl = compileCompoundNode(node, allNodes, allEdges);
        }
        
        // Rename 'run' to 'node_ID_run'
        // We use the same logic as compileGraph to ensure consistency
        const nodeIdClean = node.id.replace(/-/g, '_');
        const funcName = `node_${nodeIdClean}_run`;
        
        // Strip comments
        const cleanAnalysisCode = stripComments(nodeGlsl);
        
        // --- RENAMING LOGIC (Copied from compileGraph to prevent collisions inside Compound Node) ---

        // 1. Identify Helper Functions
        const funcDeclRegex = /^\s*(?:float|int|vec2|vec3|vec4|void|bool)\s+([a-zA-Z0-9_]+)\s*\(/gm;
        let match;
        const funcsToRename = new Set<string>();

        while ((match = funcDeclRegex.exec(cleanAnalysisCode)) !== null) {
            const fName = match[1];
            // Don't rename 'run' yet (special handling), don't rename built-ins
            if (fName !== 'run' && !GLSL_BUILTINS.has(fName)) {
                funcsToRename.add(fName);
            }
        }

        // 1.5 Identify Const Variables
        const constDeclRegex = /\bconst\s+(?:float|int|uint|bool|vec[234]|mat[234])\s+([a-zA-Z0-9_]+)\s*=/gm;
        const constsToRename = new Set<string>();
        while ((match = constDeclRegex.exec(cleanAnalysisCode)) !== null) {
            constsToRename.add(match[1]);
        }

        // 2. Perform Renaming
        // Rename Consts
        constsToRename.forEach(name => {
             const newName = `node_${nodeIdClean}_${name}`;
             const regex = new RegExp(`\\b${name}\\b`, 'g');
             nodeGlsl = nodeGlsl.replace(regex, newName);
        });

        // Rename Helper Functions
        funcsToRename.forEach(name => {
            const newName = `node_${nodeIdClean}_${name}`;
            const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
            nodeGlsl = nodeGlsl.replace(regex, `${newName}(`);
        });

        // -----------------------------------------------------------------------------------------

        // Ensure array parameter sizes in run(...) match configured lengths.
        nodeGlsl = rewriteRunArrayParamSizes(nodeGlsl, node.data.inputs || [], node.data.uniforms);

        // Rename 'run' to unique name
        const runRegex = /\bvoid\s+run\s*\(/g;
        if (runRegex.test(nodeGlsl)) {
            nodeGlsl = nodeGlsl.replace(runRegex, `void ${funcName}(`);
        } else {
             // Fallback
             nodeGlsl = `void ${funcName}(vec2 uv, out vec4 out_fallback) { out_fallback = vec4(0.0); }`;
        }
        
        code += `// Inner Node: ${node.data.label}\n${nodeGlsl}\n\n`;
    });
    
    // 2. Generate Main 'run' Function body
    // This function orchestrates the calls to inner nodes.
    // We need to traverse from Input to Output or topologically sort.
    // Simple approach: Traverse from OutputNode backwards?
    // Or just use the same traversal logic as compileGraph.
    
    const sortedNodes: Node<NodeData>[] = [];
    const visited = new Set<string>();
    
    const visit = (nid: string) => {
        if (visited.has(nid)) return;
        visited.add(nid);
        
        const node = innerNodes.find(n => n.id === nid);
        if (!node) return;
        
        // Visit dependencies
        const inputEdges = allEdges.filter(e => e.target === nid);
        inputEdges.forEach(e => visit(e.source));
        
        sortedNodes.push(node);
    };
    
    if (outputNode) visit(outputNode.id);
    
    // Also visit any nodes not connected to output but present? (Side effects? No, usually dead code)
    
    let body = '';
    
    // Map of NodeID -> Output Variable Name
    const nodeOutVars: Record<string, string> = {};
    
    // Handle Graph Input (Map arguments to variables)
    if (inputNode) {
        (inputNode.data.inputs || []).forEach(inp => {
            // The arguments of the main 'run' function will be named after these inputs
            // But we need to map them to what inner nodes expect.
            // Let's say the main run signature is: run(uv, in_input1, in_input2, ..., out_result)
            // We map GraphInput outputs to these argument names.
            nodeOutVars[`${inputNode.id}_${inp.id}`] = inp.id; // Direct mapping
        });
    }
    
    sortedNodes.forEach(node => {
        if (node.type === 'graphInput') return; // Handled via args
        if (node.type === 'graphOutput') return; // Handled at end
        
        const nodeIdClean = node.id.replace(/-/g, '_');
        const funcName = `node_${nodeIdClean}_run`;
        
        // Prepare Args
        const args: string[] = ['uv'];
        (node.data.inputs || []).forEach(inp => {
            const edge = allEdges.find(e => e.target === node.id && e.targetHandle === inp.id);
            if (edge) {
                const sourceNode = innerNodes.find(n => n.id === edge.source);
                if (sourceNode) {
                    if (sourceNode.type === 'graphInput') {
                        // Source is GraphInput
                        // The variable name is the argument name
                        // We need to find which input of GraphInput corresponds to the sourceHandle
                        // sourceHandle is the ID of the input port on GraphInput
                        args.push(edge.sourceHandle || '0.0'); 
                    } else {
                        // Standard Node
                        const sourceIdClean = sourceNode.id.replace(/-/g, '_');
                        let varName: string | null = null;
                        let sourceType = sourceNode.data.outputType;

                        if (sourceNode.data.isGlobalVar) {
                             varName = sourceNode.data.globalName || `u_global_${sourceIdClean}`;
                        } else {
                            const targetOutputId = edge.sourceHandle || 'out';
                            const sourceOutputs = sourceNode.data.outputs || [{ id: 'out', type: sourceNode.data.outputType }];
                            const outputDef = sourceOutputs.find(o => o.id === targetOutputId);

                            if (outputDef) {
                                varName = `out_${sourceIdClean}_${outputDef.id}`;
                                sourceType = outputDef.type;
                            }
                        }
                        
                        if (varName) {
                            const targetType = sanitizeType(inp.type);
                            args.push(castGLSLVariable(varName, sanitizeType(sourceType), targetType));
                        } else {
                            // Fallback to uniform if source output not found
                            if (node.data.uniforms && node.data.uniforms[inp.id]) {
                                const uniformName = `u_${nodeIdClean}_${inp.id}`;
                                args.push(uniformName);
                            } else {
                                args.push(getDefaultGLSLValue(inp.type));
                            }
                        }
                    }
                } else {
                    // Source node not found (should not happen if edge exists)
                    args.push(getDefaultGLSLValue(inp.type));
                }
            } else {
                // Not connected. Check for uniform.
                if (node.data.uniforms && node.data.uniforms[inp.id]) {
                     const uniformName = `u_${nodeIdClean}_${inp.id}`;
                     args.push(uniformName);
                } else {
                     args.push(getDefaultGLSLValue(inp.type));
                }
            }
        });
        
        // Declare Outputs
        const outputs = node.data.outputs || [{ id: 'out', type: node.data.outputType }];
        outputs.forEach(out => {
            const varName = `out_${nodeIdClean}_${out.id}`;
            body += `  ${out.type} ${varName};\n`;
            args.push(varName);
        });
        
        body += `  ${funcName}(${args.join(', ')});\n`;
    });
    
    // Handle Graph Output (Assign to output args)
    if (outputNode) {
        (outputNode.data.outputs || []).forEach(out => {
            // Find what is connected to this output
            const edge = allEdges.find(e => e.target === outputNode.id && e.targetHandle === out.id);
            if (edge) {
                const sourceNode = innerNodes.find(n => n.id === edge.source);
                if (sourceNode) {
                     if (sourceNode.type === 'graphInput') {
                         body += `  ${out.id} = ${edge.sourceHandle};\n`;
                     } else {
                         const sourceIdClean = sourceNode.id.replace(/-/g, '_');
                         let varName = `out_${sourceIdClean}_out`;
                         if (edge.sourceHandle) varName = `out_${sourceIdClean}_${edge.sourceHandle}`;
                         body += `  ${out.id} = ${varName};\n`;
                     }
                }
            } else {
                body += `  ${out.id} = ${getDefaultGLSLValue(out.type)};\n`;
            }
        });
    }
    
    // Generate Signature
    const sig = generateFunctionSignature(
        'run', 
        compoundNode.data.inputs || [], 
        compoundNode.data.outputs || [],
        compoundNode.data.uniforms
    );
    
    code += `${sig} {\n${body}}\n`;
    
    return code;
};

// --- MULTI-PASS COMPILER ---

export const compileGraph = (
  nodes: Node<NodeData>[],
  edges: Edge[],
  targetNodeId: string | null
): CompilationResult => {
  if (!targetNodeId) {
    return { passes: [], error: 'No output node selected.' };
  }

  const processedPassIDs = new Set<string>();
  const passes: RenderPass[] = [];
  const getNodeById = (id: string) => nodes.find((n) => n.id === id);

  const sanitizeIdForGlsl = (id: string) => {
      // GLSL reserves identifiers containing "__" and some implementations are strict.
      // Collapse any non-alphanumeric runs into a single underscore, trim, and avoid leading digits.
      const collapsed = id
          .replace(/[^a-zA-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

      const safe = collapsed.length > 0 ? collapsed : 'p';
      return /^[0-9]/.test(safe) ? `p_${safe}` : safe;
  };

  const getNodeOutputDef = (node: Node<NodeData>, outputId?: string | null): NodeOutput => {
      const outs = node.data.outputs;
      if (outs && outs.length > 0) {
          if (outputId) {
              const found = outs.find(o => o.id === outputId);
              if (found) return found;
          }
          return outs[0];
      }

      return { id: 'out', name: 'Output', type: node.data.outputType };
  };

  const getPassKey = (node: Node<NodeData>, requestedOutputId?: string | null) => {
      const defaultOutId = getNodeOutputDef(node, null).id;
      const resolvedOutId = getNodeOutputDef(node, requestedOutputId).id;
      return resolvedOutId === defaultOutId ? node.id : `${node.id}::${resolvedOutId}`;
  };

  type ArrayIndexLocal = {
      localName: string;
      uniformName: string;
      maxIndex: number;
  };

  const computeArrayLenForUniform = (safeType: GLSLType, uVal: UniformVal | null, fallback: number) => {
      const inferred = uVal ? (inferArrayLenFromValue(safeType, uVal.value) || fallback) : fallback;
      return resolveArrayLen(safeType, uVal, inferred);
  };

  const injectArrayIndexLocalsIntoRunBodies = (code: string, funcName: string, locals: ArrayIndexLocal[]) => {
      if (locals.length === 0) return code;
      const injection = locals
          .map(l => `  int ${l.localName} = clamp(${l.uniformName}, 0, ${l.maxIndex});`)
          .join('\n');
      const regex = new RegExp(`\\bvoid\\s+${funcName}\\s*\\([^\\)]*\\)\\s*\\{`, 'g');
      return code.replace(regex, (m) => `${m}\n${injection}\n`);
  };

  // Stack to detect Pass-Level Cycles (Texture Feedback)
  const activePassStack = new Set<string>();

  // Recursive function to generate passes
  const generatePassForNode = (nodeId: string, requestedOutputId?: string | null, targetPassId?: string): string => {
      const currentNode = getNodeById(nodeId);
      if (!currentNode) throw new Error(`Node ${nodeId} not found`);

      const passKey = getPassKey(currentNode, requestedOutputId);
      // 1. Cache Check
      if (processedPassIDs.has(passKey)) return passKey;

      // CHECK FOR MULTI-PASS
      if (currentNode.data.passes && currentNode.data.passes.length > 0) {
          // If targetPassId is specified, only process that specific pass
          const passesToProcess = targetPassId 
              ? currentNode.data.passes.filter(p => p.id === targetPassId)
              : currentNode.data.passes;
          
          if (targetPassId && passesToProcess.length === 0) {
              console.warn(`[Compiler] Target pass "${targetPassId}" not found in node ${nodeId}`);
              return nodeId; // Fallback
          }
          
          let lastPassId = '';
          const allPassIds = currentNode.data.passes.map(p => p.id);
          
          for (let i = 0; i < passesToProcess.length; i++) {
              const passDef = passesToProcess[i];
              const passId = `${currentNode.id}_pass_${passDef.id}`;
              
              if (processedPassIDs.has(passId)) {
                  lastPassId = passId;
                  continue;
              }

              const nodeIdClean = currentNode.id.replace(/-/g, '_');

              const inputTextureUniforms: Record<string, string> = {};
              
              // Parse pass dependencies from GLSL code
              const parsedIO = extractShaderIO(passDef.glsl || '');
              const passDeps = parsedIO.passDependencies || [];
              
              // Build texture references for each dependency
              for (const dep of passDeps) {
                  if (dep.type === 'specific') {
                      // Reference a specific pass by ID: u_pass_<passId>
                      // Check if this pass exists in current node
                      if (allPassIds.includes(dep.passId)) {
                          // Recursively generate the dependent pass
                          const depGeneratedId = generatePassForNode(currentNode.id, undefined, dep.passId);
                          const texUniformName = `u_pass_${sanitizeIdForGlsl(depGeneratedId)}_tex`;
                          inputTextureUniforms[dep.uniformName] = texUniformName;
                      } else {
                          console.warn(`[Compiler] Pass dependency "${dep.passId}" not found in node ${currentNode.id}`);
                      }
                  } else if (dep.type === 'first') {
                      // Reference first pass: u_firstPass
                      const firstPassId = allPassIds[0];
                      const depGeneratedId = generatePassForNode(currentNode.id, undefined, firstPassId);
                      const texUniformName = `u_pass_${sanitizeIdForGlsl(depGeneratedId)}_tex`;
                      inputTextureUniforms[dep.uniformName] = texUniformName;
                  }
                  // Note: u_prevPass (type: 'prev') is handled below
              }

              // Trigger traversal for all inputs connected to the node
              // For MultiPass, we treat all inputs as external (textures/uniforms)
              const inputEdges = edges.filter(e => e.target === currentNode.id);
              let firstInputTexture: string | null = null;
              for (const edge of inputEdges) {
                   const sourceNode = getNodeById(edge.source);
                   if (!sourceNode) continue;
                   if (!edge.targetHandle) continue;
                   
                   // Force Pass Boundary for all inputs
                   const dependencyPassId = generatePassForNode(edge.source, edge.sourceHandle);
                   const uniformName = `u_pass_${sanitizeIdForGlsl(dependencyPassId)}_tex`;
                   inputTextureUniforms[`${currentNode.id}_${edge.targetHandle}`] = uniformName;
                   
                   // Remember first input texture for u_prevPass fallback
                   if (!firstInputTexture) {
                       firstInputTexture = uniformName;
                   }
              }
              
              // Handle Previous Pass Feedback
              if (lastPassId) {
                   const uniformName = `u_pass_${sanitizeIdForGlsl(lastPassId)}_tex`;
                   inputTextureUniforms[`u_prevPass`] = uniformName;
              } else if (passDeps.some(dep => dep.uniformName === 'u_prevPass')) {
                   // For first pass that uses u_prevPass
                   if (firstInputTexture) {
                       // Use edge connection if available
                       inputTextureUniforms[`u_prevPass`] = firstInputTexture;
                   } else {
                       // Fallback: try node-level texture input (image selected on the node UI without wiring)
                       const nodeInputs = currentNode.data.inputs || [];
                       const firstTextureInput = nodeInputs.find(inp => inp.type === 'sampler2D');

                       if (firstTextureInput && currentNode.data.uniforms?.[firstTextureInput.id]?.type === 'sampler2D') {
                           // Reuse the node uniform name (declared later in the shader)
                           inputTextureUniforms[`u_prevPass`] = `u_${nodeIdClean}_${firstTextureInput.id}`;
                       } else {
                           // Final fallback: defined empty texture
                           inputTextureUniforms[`u_prevPass`] = 'u_empty_tex';
                       }
                   }
              }

              // Auto-detect Ping-Pong from GLSL pragmas or u_previousFrame usage
              // Support multiple pragmas:
              // - #pragma pingpong - enable ping-pong
              // - #pragma pingpong_init r,g,b,a - set initial color
              // - #pragma pingpong_init black|white|transparent - presets
              // - #pragma pingpong_clear - clear buffer each frame
              // - #pragma pingpong_temporary - non-persistent buffer
              if (!passDef.pingPong?.enabled) {
                  const hasPragma = /^\s*#pragma\s+pingpong/m.test(passDef.glsl);
                  const usesPreviousFrame = /\bu_previousFrame\b/.test(passDef.glsl);
                  
                  if (hasPragma || usesPreviousFrame) {
                      // Auto-enable ping-pong
                      if (!passDef.pingPong) {
                          passDef.pingPong = { enabled: true };
                      } else {
                          passDef.pingPong.enabled = true;
                      }
                  }
              }
              
              // Parse Ping-Pong configuration from pragmas (code-first approach)
              if (passDef.pingPong?.enabled) {
                  // Parse init value: #pragma pingpong_init r,g,b,a or preset
                  const initMatch = /^\s*#pragma\s+pingpong_init\s+(.+)/m.exec(passDef.glsl);
                  if (initMatch && !passDef.pingPong.initValue) {
                      const initStr = initMatch[1].trim();
                      if (initStr === 'black') {
                          passDef.pingPong.initValue = [0, 0, 0, 1];
                      } else if (initStr === 'white') {
                          passDef.pingPong.initValue = [1, 1, 1, 1];
                      } else if (initStr === 'transparent') {
                          passDef.pingPong.initValue = [0, 0, 0, 0];
                      } else {
                          // Parse comma-separated values
                          const values = initStr.split(',').map(v => parseFloat(v.trim()));
                          if (values.length >= 3 && values.every(v => !isNaN(v))) {
                              passDef.pingPong.initValue = [
                                  values[0],
                                  values[1],
                                  values[2],
                                  values[3] !== undefined ? values[3] : 1.0
                              ] as [number, number, number, number];
                          }
                      }
                  }
                  
                  // Parse clear flag: #pragma pingpong_clear
                  if (/^\s*#pragma\s+pingpong_clear/m.test(passDef.glsl)) {
                      if (passDef.pingPong.clearEachFrame === undefined) {
                          passDef.pingPong.clearEachFrame = true;
                      }
                  }
                  
                  // Parse temporary flag: #pragma pingpong_temporary
                  if (/^\s*#pragma\s+pingpong_temporary/m.test(passDef.glsl)) {
                      if (passDef.pingPong.persistent === undefined) {
                          passDef.pingPong.persistent = false;
                      }
                  }
                  
                  // Set defaults if not specified
                  if (passDef.pingPong.persistent === undefined) {
                      passDef.pingPong.persistent = true;
                  }
                  if (passDef.pingPong.clearEachFrame === undefined) {
                      passDef.pingPong.clearEachFrame = false;
                  }
              }
              
              // Auto-detect Loop from GLSL pragma
              // Support: #pragma loop N (where N is a number)
              if (!passDef.loop || passDef.loop <= 1) {
                  const loopMatch = /^\s*#pragma\s+loop\s+(\d+)/m.exec(passDef.glsl);
                  if (loopMatch) {
                      const loopCount = parseInt(loopMatch[1], 10);
                      if (loopCount > 1) {
                          passDef.loop = loopCount;
                      }
                  }
              }

              // Generate Shader Code
              let code = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 fragColor;
#define texture2D texture
#define gl_FragColor fragColor
uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_empty_tex;
uniform samplerCube u_empty_cube;
#define iTime u_time
#define iResolution vec3(u_resolution, 1.0)
`;

              // Inject loop metadata for passes using #pragma loop / pass.loop.
              // These uniforms are useful for algorithms that need per-iteration parameters.
              if (passDef.loop && passDef.loop > 1) {
                  code += `uniform int u_loopIndex;\nuniform int u_loopCount;\n`;
              }
              
              // Inject u_previousFrame for Ping-Pong passes
              if (passDef.pingPong?.enabled) {
                  code += `uniform sampler2D u_previousFrame;\n`;
              }
              
              // Inject Uniforms
              const nodeUniformKeys = new Set(
                  Object.keys(currentNode.data.uniforms || {})
                      .filter(k => k !== 'value')
                      .map(k => `u_${nodeIdClean}_${k}`)
              );

              const uniqueTextureUniforms = new Set(Object.values(inputTextureUniforms));
              uniqueTextureUniforms.forEach(uName => {
                  // Avoid redeclaring built-ins and node uniforms
                  if (uName === 'u_empty_tex') return;
                  if (nodeUniformKeys.has(uName)) return;
                  code += `uniform sampler2D ${uName};\n`;
              });
              
              // Inject pass dependency uniform mappings
              // Map user-facing names (u_pass_xxx, u_prevPass, u_firstPass) to actual texture uniforms
              for (const dep of passDeps) {
                  if (inputTextureUniforms[dep.uniformName]) {
                      code += `#define ${dep.uniformName} ${inputTextureUniforms[dep.uniformName]}\n`;
                  }
              }
              
              // Map u_prevPass if present
              if (inputTextureUniforms['u_prevPass']) {
                  code += `#define u_prevPass ${inputTextureUniforms['u_prevPass']}\n`;
              }
              
              code += '// Inject Node Uniforms\n';
              // Inject Node Uniforms
              const passUniforms: Record<string, { type: GLSLType; value: UniformValueType }> = {};

              Object.entries(currentNode.data.uniforms).forEach(([key, u]) => {
                  if (key === 'value') return; // Skip internal value
                  
                  // Use unique name to match buildUniformOverridesFromNodes logic
                  const uniqueKey = `u_${nodeIdClean}_${key}`;

                  const safeType = sanitizeType(u.type);
                  if (safeType === 'float[]' || safeType === 'int[]' || safeType === 'uint[]' || safeType === 'bool[]' || safeType === 'vec2[]' || safeType === 'vec3[]' || safeType === 'vec4[]') {
                      const base = safeType.replace('[]', '');
                      const len = resolveArrayLen(safeType, u, inferArrayLenFromValue(safeType, u.value) || 16);
                      code += `uniform ${base} ${uniqueKey}[${len}];\n`;
                      passUniforms[uniqueKey] = { type: safeType, value: getUniformValue(safeType, u.value, len) };
                  } else {
                      code += `uniform ${safeType} ${uniqueKey};\n`;
                      passUniforms[uniqueKey] = { type: safeType, value: u.value };
                  }
                  code += `#define ${key} ${uniqueKey}\n`;
              });
              
              // Add pass dependency uniforms to passUniforms (for direct reference in GLSL)
              // These were collected earlier in inputTextureUniforms
              for (const dep of passDeps) {
                  if (inputTextureUniforms[dep.uniformName]) {
                      passUniforms[dep.uniformName] = {
                          type: 'sampler2D',
                          value: inputTextureUniforms[dep.uniformName]
                      };
                  }
              }
              
              // Add u_prevPass if present
              if (inputTextureUniforms['u_prevPass']) {
                  passUniforms['u_prevPass'] = {
                      type: 'sampler2D',
                      value: inputTextureUniforms['u_prevPass']
                  };
              }

              // Inject User Code (strip custom pragmas first)
              let userCode = passDef.glsl;
              // Remove all custom pragmas that are not standard GLSL
              userCode = userCode.replace(/^\s*#pragma\s+pingpong(_init\s+[^\n]*|_clear|_temporary)?\s*$/gm, '');
              userCode = userCode.replace(/^\s*#pragma\s+loop\s+\d+\s*$/gm, '');
              code += `\n${userCode}\n`;
              
              // If user code has `run` but no `main`, generate main.
              if (!/\bvoid\s+main\s*\(/.test(passDef.glsl)) {
                  // Parse THIS pass to get its specific inputs
                  // Note: extractShaderIO already filters out pass dependencies (u_pass_*, u_prevPass, u_firstPass)
                  // and internal uniforms (u_previousFrame). These are available as uniforms, not parameters.
                  const { inputs: passInputs } = extractShaderIO(passDef.glsl);
                  
                  const args = ['vUv'];
                  
                  // Map all remaining inputs (pass dependencies already filtered out)
                  passInputs.forEach(inp => {
                      const key = `${currentNode.id}_${inp.id}`;
                      const uName = inputTextureUniforms[key];
                      
                      // Check if it's a uniform (not a texture input)
                      const isUniform = currentNode.data.uniforms[inp.id] !== undefined;

                      if (uName) {
                          if (inp.type === 'float') args.push(`texture(${uName}, vUv).r`);
                          else if (inp.type === 'vec3') args.push(`texture(${uName}, vUv).rgb`);
                          else if (inp.type === 'sampler2D') args.push(uName);
                          else args.push(`texture(${uName}, vUv)`);
                      } else if (isUniform) {
                          // It's a uniform value (slider, etc.)
                          // We use the original key here because we added a #define above
                          args.push(inp.id);
                      } else {
                          // Fallback for missing inputs
                          args.push(getDefaultGLSLValue(inp.type));
                      }
                  });
                  args.push('fragColor');
                  code += `\nvoid main() { run(${args.join(', ')}); }\n`;
              }

              const loopCount = passDef.loop && passDef.loop > 1 ? passDef.loop : 1;

              if (loopCount > 1) {
                  passUniforms['u_loopIndex'] = { type: 'int', value: 0 };
                  passUniforms['u_loopCount'] = { type: 'int', value: loopCount };
              }
              
              const renderPass: RenderPass = {
                  id: passId,
                  vertexShader: DEFAULT_VERTEX_SHADER,
                  fragmentShader: code,
                  uniforms: passUniforms,
                  outputTo: 'FBO', // Always FBO for internal passes
                  inputTextureUniforms: inputTextureUniforms
              };
              
              // Add Ping-Pong configuration if enabled
              if (passDef.pingPong?.enabled) {
                  renderPass.pingPong = {
                      enabled: true,
                      bufferName: passDef.pingPong.bufferName || `${currentNode.id}_${passDef.id}`,
                      initValue: passDef.pingPong.initValue,
                      persistent: passDef.pingPong.persistent ?? true,
                      clearEachFrame: passDef.pingPong.clearEachFrame ?? false
                  };
              }
              
              // Handle loop: repeat the pass multiple times
              for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
                  // For looped passes, create unique IDs for each iteration
                  let loopInputTextureUniforms = { ...inputTextureUniforms };
                  
                  // For iterations after the first, u_prevPass should reference previous iteration
                  if (loopIdx > 0) {
                      // loopIdx=1 should reference the *first* iteration's output (which keeps the base passId)
                      // not a non-existent `${passId}_loop0`.
                      const prevIterationPassId = loopIdx === 1 ? passId : `${passId}_loop${loopIdx - 1}`;
                      const prevIterationTex = `u_pass_${sanitizeIdForGlsl(prevIterationPassId)}_tex`;
                      loopInputTextureUniforms['u_prevPass'] = prevIterationTex;
                  }
                  // For first iteration, u_prevPass is already set from lastPassId (if exists)
                  // or from input connections
                  
                  // Regenerate shader code with updated inputTextureUniforms for loop iterations
                  let loopCode = code;
                  if (loopIdx > 0) {
                      const prevTexName = loopInputTextureUniforms['u_prevPass'];
                      if (prevTexName && prevTexName !== 'u_empty_tex') {
                          const decl = `uniform sampler2D ${prevTexName};\n`;

                          // Ensure the underlying sampler uniform exists in the shader.
                          // The base code only declares uniforms from the first iteration's inputs.
                          if (!loopCode.includes(decl)) {
                              const anchorCube = 'uniform samplerCube u_empty_cube;\n';
                              const anchor2D = 'uniform sampler2D u_empty_tex;\n';
                              if (loopCode.includes(anchorCube)) {
                                  loopCode = loopCode.replace(anchorCube, `${anchorCube}${decl}`);
                              } else if (loopCode.includes(anchor2D)) {
                                  loopCode = loopCode.replace(anchor2D, `${anchor2D}${decl}`);
                              } else {
                                  loopCode = `${decl}${loopCode}`;
                              }
                          }

                          // Rewrite ALL occurrences (the base code may define u_prevPass twice)
                          loopCode = loopCode.replace(
                              /^\s*#define\s+u_prevPass\s+[^\n]*$/gm,
                              `#define u_prevPass ${prevTexName}`
                          );
                      }
                  }
                  
                  const loopedUniforms = loopCount > 1
                      ? {
                          ...passUniforms,
                          u_loopIndex: { type: 'int', value: loopIdx },
                          u_loopCount: { type: 'int', value: loopCount }
                      }
                      : passUniforms;

                  const loopedPass = loopIdx === 0 ? {
                      ...renderPass,
                      uniforms: loopedUniforms,
                      inputTextureUniforms: loopInputTextureUniforms
                  } : {
                      ...renderPass,
                      id: `${passId}_loop${loopIdx}`,
                      fragmentShader: loopCode,
                      uniforms: loopedUniforms,
                      inputTextureUniforms: loopInputTextureUniforms
                  };
                  
                  passes.push(loopedPass);
                  processedPassIDs.add(loopedPass.id);
                  lastPassId = loopedPass.id;
              }
          }
          
          // Register the Node ID as processed, mapping to the last pass
          // But processedPassIDs is a Set<string>.
          // We can't map.
          // But we return lastPassId.
          // The caller (if any) will use lastPassId.
          // But if we are called again with currentNode.id, we need to return lastPassId.
          // We can't easily do that with a Set.
          // But wait, getPassKey returns currentNode.id.
          // If we add currentNode.id to processedPassIDs, next time we return currentNode.id.
          // But currentNode.id is NOT a valid pass ID in the `passes` array!
          // This is a problem.
          
          // Solution: We need a map `nodeIdToPassId`.
          // Or we just re-run this loop (it checks processedPassIDs internally so it's fast).
          // Yes, re-running the loop is fine. It will find all passes processed and return lastPassId.
          
          return lastPassId;
      }

      // 2. Cycle Detection (Pass Level)
      if (activePassStack.has(passKey)) {
          console.warn(`[Compiler] Pass Cycle detected at pass ${passKey}. Breaking loop.`);
          // Return id but do NOT recurse. The texture uniform will effectively be the "previous frame" 
          // (or null if not rendered yet) which effectively allows feedback-like behavior without infinite compilation.
          return passKey; 
      }

      activePassStack.add(passKey);

      // 3. Identify "Local Graph" for this pass
      const localNodes: Node<NodeData>[] = [];
      const visitedInPass = new Set<string>();
      // Stack to detect Inline-Level Cycles (Math Loops)
      const activeInlineStack = new Set<string>(); 
      
      const inputTextureUniforms: Record<string, string> = {}; 
      
      const traverseLocal = (nid: string) => {
          if (visitedInPass.has(nid)) return;
          
          // Inline Cycle Detection
          if (activeInlineStack.has(nid)) {
              console.warn(`[Compiler] Inline Cycle detected at node ${nid}. Breaking edge.`);
              return;
          }

          const node = getNodeById(nid);
          if (!node) return;

          activeInlineStack.add(nid);

          // Check inputs to decide if we continue traversing or link to a previous pass
          const inputEdges = edges.filter(e => e.target === nid);
          
          for (const edge of inputEdges) {
              const sourceNode = getNodeById(edge.source);
              if (!sourceNode) continue;

              const targetHandle = node.data.inputs.find(i => i.id === edge.targetHandle);
              if (!targetHandle) continue;

              const sourceOutDef = getNodeOutputDef(sourceNode, edge.sourceHandle);
              const sourceType = sanitizeType(sourceOutDef.type);
              const targetType = sanitizeType(targetHandle.type);

              // DETECT PASS BOUNDARY
              const isSourceMultiPass = sourceNode.data.passes && sourceNode.data.passes.length > 0;
              if ((targetType === 'sampler2D' && sourceType !== 'sampler2D') || isSourceMultiPass) {
                  // Pass Boundary found -> Recurse to create new pass
                  const dependencyPassId = generatePassForNode(edge.source, edge.sourceHandle);
                  const uniformName = `u_pass_${sanitizeIdForGlsl(dependencyPassId)}_tex`;
                  inputTextureUniforms[`${nid}_${targetHandle.id}`] = uniformName;
              } else {
                  // Standard inline dependency
                  traverseLocal(edge.source);
              }
          }
          
          activeInlineStack.delete(nid);
          visitedInPass.add(nid);
          localNodes.push(node); 
      };

      try {
          traverseLocal(nodeId);
      } catch (e: any) {
          throw new Error(`Graph Cycle or Error: ${e.message}`);
      }

      // 4. Compile the "Local Graph"
      let functionsCode = '';
      let mainBodyCode = '';
      
      let header = `#version 300 es
precision mediump float;
in vec2 vUv;
out vec4 fragColor;
#define texture2D texture

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_empty_tex;
uniform samplerCube u_empty_cube;

// Shadertoy compatibility
#define iTime u_time
#define iResolution vec3(u_resolution, 1.0)
`;

      // Helper to get actual value for uniforms
      const getDefaultUniformValue = (type: GLSLType, arrayLen?: number) => {
          if (type === 'vec2') return new Float32Array([0,0]);
          if (type === 'vec3') return new Float32Array([0,0,0]);
          if (type === 'vec4') return new Float32Array([0,0,0,1]);
          if (type === 'int[]') return new Int32Array(Array(Math.max(1, Math.round(arrayLen ?? 16))).fill(0));
          if (type === 'uint[]') return new Uint32Array(Array(Math.max(1, Math.round(arrayLen ?? 16))).fill(0));
          if (type === 'bool[]') return new Int32Array(Array(Math.max(1, Math.round(arrayLen ?? 16))).fill(0));
          if (type === 'float[]') return new Float32Array(Array(Math.max(1, Math.round(arrayLen ?? 16))).fill(0));
          if (type === 'vec2[]') return new Float32Array(Array(Math.max(1, Math.round(arrayLen ?? 16)) * 2).fill(0));
          if (type === 'vec3[]') return new Float32Array(Array(Math.max(1, Math.round(arrayLen ?? 16)) * 3).fill(0));
          if (type === 'vec4[]') return new Float32Array(Array(Math.max(1, Math.round(arrayLen ?? 16)) * 4).fill(0));
          return 0;
      };

      const globalUniforms: Record<string, { type: GLSLType; value: UniformValueType }> = {};

      const uniqueTextureUniforms = new Set(Object.values(inputTextureUniforms));
      uniqueTextureUniforms.forEach(uName => {
          header += `uniform sampler2D ${uName};\n`;
      });
      
      // Add pass dependency mappings (#define for u_pass_xxx, u_prevPass, etc.)
      // Map user-facing names to actual texture uniform names
      Object.entries(inputTextureUniforms).forEach(([key, texUniform]) => {
          // Extract the pass dependency name from the key
          // Keys are in format: "nodeId_uniformName" (e.g., "node123_u_pass_blur")
          const parts = key.split('_');
          if (parts.length >= 3 && (parts[1] === 'pass' || parts[1] === 'prevPass' || parts[1] === 'firstPass' || parts[1] === 'previousFrame')) {
              // Extract the uniform name (everything after the first underscore in nodeId)
              const uniformName = key.substring(key.indexOf('_', key.indexOf('_') + 1) + 1);
              if (uniformName && uniformName.startsWith('u_')) {
                  header += `#define ${uniformName} ${texUniform}\n`;
              }
          }
      });

      const injectUniformsRecursive = (n: Node<NodeData>) => {
          const nodeIdClean = n.id.replace(/-/g, '_');
          
          // Handle Global Vars
          if (n.data.isGlobalVar) {
                const name = n.data.globalName || `u_global_${nodeIdClean}`;
                const type = sanitizeType(n.data.outputType || 'float');
                
                if (!globalUniforms[name]) {
                    if (type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]' || type === 'vec2[]' || type === 'vec3[]' || type === 'vec4[]') {
                        const base = type.replace('[]', '');
                        const len = resolveArrayLen(type, n.data.uniforms?.value || null, inferArrayLenFromValue(type, n.data.value) || 16);
                        header += `uniform ${base} ${name}[${len}];\n`;
                    } else {
                        header += `uniform ${type} ${name};\n`;
                    }
                    
                    let val = n.data.value;
                    if (val === undefined && n.data.uniforms && n.data.uniforms['value']) {
                        val = n.data.uniforms['value'].value;
                    }
                    const len = (type === 'float[]' || type === 'int[]' || type === 'uint[]' || type === 'bool[]' || type === 'vec2[]' || type === 'vec3[]' || type === 'vec4[]')
                        ? resolveArrayLen(type, n.data.uniforms?.value || null, inferArrayLenFromValue(type, val) || 16)
                        : undefined;
                    if (val === undefined) val = getDefaultUniformValue(type, len);
                    globalUniforms[name] = { type, value: getUniformValue(type, val, len) };
                }
                return; 
          }

          // Handle Standard Uniforms
          (n.data.inputs || []).forEach(input => {
             if (n.data.uniforms && n.data.uniforms[input.id]) {
                 const uVal = n.data.uniforms[input.id];
                 const uniformName = `u_${nodeIdClean}_${input.id}`;
                 const safeType = sanitizeType(uVal.type);
                 
                 if (globalUniforms[uniformName]) return;

                 if (safeType === 'float[]' || safeType === 'int[]' || safeType === 'uint[]' || safeType === 'bool[]' || safeType === 'vec2[]' || safeType === 'vec3[]' || safeType === 'vec4[]') {
                     const base = safeType.replace('[]', '');
                     const len = resolveArrayLen(safeType, uVal, inferArrayLenFromValue(safeType, uVal.value) || 16);
                     header += `uniform ${base} ${uniformName}[${len}];\n`;
                 } else {
                     header += `uniform ${safeType} ${uniformName};\n`;
                 }
                 
                 const len = (safeType === 'float[]' || safeType === 'int[]' || safeType === 'uint[]' || safeType === 'bool[]' || safeType === 'vec2[]' || safeType === 'vec3[]' || safeType === 'vec4[]')
                    ? resolveArrayLen(safeType, uVal, inferArrayLenFromValue(safeType, uVal.value) || 16)
                    : undefined;
                 let val = getUniformValue(safeType, uVal.value, len);
                 
                 if (safeType === 'sampler2D') {
                    if (uVal.widget === 'gradient' && uVal.widgetConfig?.gradientStops) {
                        const w = n.data.resolution?.w || 512;
                        val = generateGradientTexture(
                          uVal.widgetConfig.gradientStops, 
                          w, 
                          uVal.widgetConfig.alphaStops
                        );
                    } else if (uVal.widget === 'curve' && uVal.widgetConfig?.curvePoints) {
                        const w = n.data.resolution?.w || 512;
                        val = generateCurveTexture(
                            uVal.widgetConfig.curvePoints, 
                            w,
                            uVal.widgetConfig.curvePointsR,
                            uVal.widgetConfig.curvePointsG,
                            uVal.widgetConfig.curvePointsB,
                            uVal.widgetConfig.curvePointsA
                        );
                    }
                 }
                 
                 if ((safeType === 'vec3' || safeType === 'vec4' || safeType === 'float') && (uVal.widget === 'gradient' || uVal.widget === 'curve')) {
                     let textureData = null;
                     const w = 512;
                     if (uVal.widget === 'gradient' && uVal.widgetConfig?.gradientStops) {
                         textureData = generateGradientTexture(uVal.widgetConfig.gradientStops, w, uVal.widgetConfig.alphaStops);
                     } else if (uVal.widget === 'curve' && uVal.widgetConfig?.curvePoints) {
                         textureData = generateCurveTexture(
                             uVal.widgetConfig.curvePoints, 
                             w,
                             uVal.widgetConfig.curvePointsR,
                             uVal.widgetConfig.curvePointsG,
                             uVal.widgetConfig.curvePointsB,
                             uVal.widgetConfig.curvePointsA
                         );
                     }

                     if (textureData) {
                         const centerIdx = Math.floor(w / 2) * 4;
                         const r = textureData.data[centerIdx] / 255;
                         const g = textureData.data[centerIdx + 1] / 255;
                         const b = textureData.data[centerIdx + 2] / 255;
                         const a = textureData.data[centerIdx + 3] / 255;

                         if (safeType === 'vec4') {
                             // Curve editor currently has no A channel; preserve original alpha for curve-driven vec4.
                             let preservedAlpha: number | null = null;
                             if (uVal.widget === 'curve') {
                                 const original = getUniformValue(safeType, uVal.value);
                                 if (original instanceof Float32Array && original.length >= 4) {
                                     preservedAlpha = original[3];
                                 } else if (Array.isArray(original) && original.length >= 4 && typeof original[3] === 'number') {
                                     preservedAlpha = original[3];
                                 }
                             }
                             val = new Float32Array([r, g, b, preservedAlpha ?? a]);
                         }
                         else if (safeType === 'vec3') val = new Float32Array([r,g,b]);
                         else if (safeType === 'float') val = r;
                     }
                 }

                 globalUniforms[uniformName] = { type: safeType, value: val };
             }
          });

          // Scheme B: for ALL array inputs, expose an implicit index uniform.
          // The GLSL code will receive a local variable named <inputId>_index (injected per run body).
          (n.data.inputs || []).forEach(input => {
              const safeType = sanitizeType(input.type);
              if (!isArrayType(safeType)) return;
              const indexUniformName = `u_${nodeIdClean}_${input.id}_index`;
              if (globalUniforms[indexUniformName]) return;

              header += `uniform int ${indexUniformName};\n`;

              const uVal = n.data.uniforms?.[input.id] ?? null;
              const len = computeArrayLenForUniform(safeType, uVal, 16);
              const rawIdx = uVal?.widgetConfig && typeof uVal.widgetConfig.arrayIndex === 'number' && Number.isFinite(uVal.widgetConfig.arrayIndex)
                  ? Math.round(uVal.widgetConfig.arrayIndex)
                  : 0;
              const maxIndex = Math.max(0, len - 1);
              const clamped = Math.max(0, Math.min(maxIndex, rawIdx));
              globalUniforms[indexUniformName] = { type: 'int', value: clamped };
          });

          if (n.data.isCompound) {
              const inner = nodes.filter(innerN => innerN.data.scopeId === n.id);
              inner.forEach(injectUniformsRecursive);
          }
      };

      // --- GENERATE FUNCTIONS & UNIFORMS ---
      localNodes.forEach(node => {
        const nodeIdClean = node.id.replace(/-/g, '_');
        const mainFuncName = `node_${nodeIdClean}_run`;
        
        // --- SPECIAL HANDLING: GLOBAL VARIABLE ---
        if (node.data.isGlobalVar) {
            const name = node.data.globalName || `u_global_${nodeIdClean}`;
            const type = sanitizeType(node.data.outputType || 'float');
            header += `uniform ${type} ${name};\n`;
            
            // Add to globalUniforms
            let val = node.data.value;
            // Fallback to uniforms if data.value is not set (e.g. from UI widget)
            if (val === undefined && node.data.uniforms && node.data.uniforms['value']) {
                val = node.data.uniforms['value'].value;
            }

            if (val === undefined) val = getDefaultUniformValue(type);
            globalUniforms[name] = { type, value: getUniformValue(type, val) };
            
            return; // Skip function generation
        }

        // --- SPECIAL HANDLING: GRAPH INPUT ---
        if (node.type === 'graphInput') {
            // 1. Generate Uniforms
            const outputs = node.data.outputs || [];
            outputs.forEach(out => {
                 const uniformName = `u_${nodeIdClean}_${out.id}`;
                 const safeType = sanitizeType(out.type);
                 header += `uniform ${safeType} ${uniformName};\n`;
                 globalUniforms[uniformName] = { type: safeType, value: getDefaultUniformValue(safeType) };
            });

            // 2. Generate Function
            let body = '';
            outputs.forEach(o => {
                body += `${o.id} = u_${nodeIdClean}_${o.id};\n`;
            });
            // If no outputs, body is empty
            if (outputs.length === 0) body = '// No outputs\n';
            
            const sig = generateFunctionSignature(mainFuncName, [], outputs, node.data.uniforms);
            
            functionsCode += `${sig} {\n${body}}\n\n`;

            return; // Done for GraphInput
        }

        // --- SPECIAL HANDLING: GRAPH OUTPUT ---
        if (node.type === 'graphOutput') {
            // 1. Generate Function
            const inputs = node.data.inputs || [];
            
            // Logic: Pass first input to result (preview)
            let body = 'result = vec4(0.0);';
            if (inputs.length > 0) {
                const first = inputs[0];
                body = `result = ${castGLSLVariable(first.id, 'vec4', 'vec4')};`; // Force cast to vec4
                // Note: castGLSLVariable expects types, but here we might need to cast from input type
                body = `result = ${castGLSLVariable(first.id, first.type, 'vec4')};`;
            }
            
            const sig = generateFunctionSignature(
                mainFuncName, 
                inputs, 
                [{ id: 'result', type: 'vec4' }],
                node.data.uniforms
            );
            
            functionsCode += `${sig} {\n  ${body}\n}\n\n`;

            return; // Done for GraphOutput
        }

        // A. Inject Uniforms for ALL Inputs
        injectUniformsRecursive(node);

        // B. Process & Rename Functions
        let userCode = node.data.glsl;
        
        // Handle Compound Nodes
        if (node.data.isCompound) {
            userCode = compileCompoundNode(node, nodes, edges);
        }
        
        // CLEAN CODE for analysis (remove comments)
        const cleanAnalysisCode = stripComments(userCode);

        // 1. Identify Helper Functions defined in this node (e.g. rgb2hsv)
        // Regex looks for: returnType functionName ( ...
        const funcDeclRegex = /^\s*(?:float|int|vec2|vec3|vec4|void|bool)\s+([a-zA-Z0-9_]+)\s*\(/gm;
        let match;
        const funcsToRename = new Set<string>();

        // We run regex on CLEAN code to avoid matching functions inside comments
        while ((match = funcDeclRegex.exec(cleanAnalysisCode)) !== null) {
            const funcName = match[1];
            // Don't rename 'run' yet (special handling), don't rename built-ins
            if (funcName !== 'run' && !GLSL_BUILTINS.has(funcName)) {
                funcsToRename.add(funcName);
            }
        }

        // 1.5 Identify Const Variables (to prevent redefinition errors on copy)
        // Regex: const type name = value;
        const constDeclRegex = /\bconst\s+(?:float|int|uint|bool|vec[234]|mat[234])\s+([a-zA-Z0-9_]+)\s*=/gm;
        const constsToRename = new Set<string>();
        while ((match = constDeclRegex.exec(cleanAnalysisCode)) !== null) {
            constsToRename.add(match[1]);
        }

        // 2. Perform Renaming
        // Rename Consts
        constsToRename.forEach(name => {
             const newName = `node_${nodeIdClean}_${name}`;
             // Use word boundary to avoid partial matches
             const regex = new RegExp(`\\b${name}\\b`, 'g');
             userCode = userCode.replace(regex, newName);
        });

        // Rename Helper Functions
        funcsToRename.forEach(name => {
            const newName = `node_${nodeIdClean}_${name}`;
            // Replace both definition and usage. 
            // We match the name followed by an opening parenthesis to ensure we are targeting function calls/defs
            // and not variable names.
            const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
            userCode = userCode.replace(regex, `${newName}(`);
        });

        // 3. Ensure array parameter sizes in run(...) match configured lengths, then rename.
        userCode = rewriteRunArrayParamSizes(userCode, node.data.inputs || [], node.data.uniforms);

        // 3. Rename Main 'run' Function
        const runRegex = /\bvoid\s+run\s*\(/g;
        if (runRegex.test(userCode)) {
            userCode = userCode.replace(runRegex, `void ${mainFuncName}(`);
        } else {
             userCode = `void ${mainFuncName}(vec2 uv, out vec4 out_fallback) { out_fallback = vec4(0.0); }`;
        }

        // Scheme B: inject <inputId>_index locals for ALL array inputs.
        const arrayIndexLocals: ArrayIndexLocal[] = [];
        for (const input of node.data.inputs || []) {
            const safeType = sanitizeType(input.type);
            if (!isArrayType(safeType)) continue;
            const uVal = node.data.uniforms?.[input.id] ?? null;
            const uniformName = `u_${nodeIdClean}_${input.id}_index`;
            const len = computeArrayLenForUniform(safeType, uVal, 16);
            arrayIndexLocals.push({
                localName: `${input.id}_index`,
                uniformName,
                maxIndex: Math.max(0, len - 1),
            });
        }
        if (arrayIndexLocals.length > 0) {
            userCode = injectArrayIndexLocalsIntoRunBodies(userCode, mainFuncName, arrayIndexLocals);
        }

        functionsCode += `// Node: ${node.data.label}\n${userCode}\n\n`;
      });

      // --- MAIN LOOP ---
      mainBodyCode += `void main() {\n  vec2 uv = vUv;\n`;

      type ArrayElementEdge = { edge: Edge; index: number };

      const collectArrayElementEdges = (targetNodeId: string, baseInputId: string): ArrayElementEdge[] => {
          return edges
              .filter(e => e.target === targetNodeId)
              .map(e => ({ e, parsed: parseArrayElementHandle(e.targetHandle) }))
              .filter(x => x.parsed && x.parsed.baseId === baseInputId)
              .map(x => ({ edge: x.e, index: x.parsed!.index }));
      };

      const resolveConnectedExpr = (edgeToResolve: Edge, targetType: GLSLType): string => {
          const sourceNode = getNodeById(edgeToResolve.source);
          const isSourceAvailable = sourceNode && localNodes.some(n => n.id === sourceNode.id);
          if (!isSourceAvailable || !sourceNode) return getDefaultGLSLValue(targetType);

          const sourceIdClean = sourceNode.id.replace(/-/g, '_');
          let sourceVarName: string | null = null;
          let sourceType = sourceNode.data.outputType;

          if (sourceNode.data.isGlobalVar) {
              sourceVarName = sourceNode.data.globalName || `u_global_${sourceIdClean}`;
              sourceType = sourceNode.data.outputType;
          } else {
              const targetOutputId = edgeToResolve.sourceHandle || 'out';
              const sourceOutputs = sourceNode.data.outputs || [{ id: 'out', type: sourceNode.data.outputType }];
              const outputDef = sourceOutputs.find(o => o.id === targetOutputId);
              if (outputDef) {
                  sourceVarName = `out_${sourceIdClean}_${outputDef.id}`;
                  sourceType = outputDef.type;
              }
          }

          if (!sourceVarName) return getDefaultGLSLValue(targetType);
          return castGLSLVariable(sourceVarName, sanitizeType(sourceType), targetType);
      };

      const emitArrayVarFromElementEdges = (opts: {
          nodeIdClean: string;
          input: { id: string; type: string };
          elementEdges: ArrayElementEdge[];
          uniformName?: string | null;
          uniformVal?: UniformVal | null;
      }): { handled: boolean; code: string; arg?: string } => {
          const safeInputType = sanitizeType(opts.input.type);
          const isArrayInput = isArrayType(safeInputType);
          if (!isArrayInput) return { handled: false, code: '' };
          if (opts.elementEdges.length === 0) return { handled: false, code: '' };

          const fallbackLen = opts.uniformVal ? (inferArrayLenFromValue(safeInputType, opts.uniformVal.value) || 16) : 16;
          const len = resolveArrayLen(safeInputType, opts.uniformVal ?? null, fallbackLen);
          const elementType = sanitizeType(String(opts.input.type).slice(0, -2));
          const arrVar = `arr_${opts.nodeIdClean}_${sanitizeIdForGlsl(opts.input.id)}`;
          const defaultInit = getDefaultGLSLValue(safeInputType, len);

          let code = `  ${elementType} ${arrVar}[${len}] = ${defaultInit};\n`;
          if (opts.uniformVal && opts.uniformName) {
              code += `  for (int i = 0; i < ${len}; i++) { ${arrVar}[i] = ${opts.uniformName}[i]; }\n`;
          }

          const sorted = [...opts.elementEdges].sort((a, b) => a.index - b.index);
          for (const item of sorted) {
              const idx = Math.max(0, Math.min(len - 1, Math.round(item.index)));
              const rhs = resolveConnectedExpr(item.edge, elementType);
              code += `  ${arrVar}[${idx}] = ${rhs};\n`;
          }

          return { handled: true, code, arg: arrVar };
      };

      localNodes.forEach(node => {
          const nodeIdClean = node.id.replace(/-/g, '_');
          const funcName = `node_${nodeIdClean}_run`;
          
          // --- SPECIAL HANDLING: GLOBAL VARIABLE ---
          if (node.data.isGlobalVar) {
              return; // Global variables are uniforms, no run function to call
          }

          // --- SPECIAL HANDLING: GRAPH INPUT ---
          if (node.type === 'graphInput') {
              const outputs = node.data.outputs || [];
              const callOutVars: string[] = [];
              outputs.forEach(out => {
                  const varName = `out_${nodeIdClean}_${out.id}`;
                  mainBodyCode += `  ${out.type} ${varName};\n`;
                  callOutVars.push(varName);
              });
              const args = ['uv', ...callOutVars];
              mainBodyCode += `  ${funcName}(${args.join(', ')});\n`;
              return;
          }

          // --- SPECIAL HANDLING: GRAPH OUTPUT ---
          if (node.type === 'graphOutput') {
              const inputs = node.data.inputs || [];
              const callArgs: string[] = [];
              
              inputs.forEach(input => {
                  const passTextureUniform = inputTextureUniforms[`${node.id}_${input.id}`];
                  if (passTextureUniform) {
                      if (input.type === 'sampler2D') {
                          callArgs.push(passTextureUniform);
                      } else {
                          const sample = `texture(${passTextureUniform}, uv)`;
                          callArgs.push(castGLSLVariable(sample, 'vec4', sanitizeType(input.type)));
                      }
                  } else {
                      const edge = edges.find(e => e.target === node.id && e.targetHandle === input.id);

                      const elementEdges = !edge ? collectArrayElementEdges(node.id, input.id) : [];
                      const arrayEmit = emitArrayVarFromElementEdges({
                          nodeIdClean,
                          input,
                          elementEdges,
                          uniformName: null,
                          uniformVal: null,
                      });
                      if (!edge && arrayEmit.handled) {
                          mainBodyCode += arrayEmit.code;
                          if (arrayEmit.arg) callArgs.push(arrayEmit.arg);
                          return;
                      }
                      if (edge) {
                          const sourceNode = getNodeById(edge.source);
                          const isSourceAvailable = sourceNode && localNodes.some(n => n.id === sourceNode.id);

                          if (isSourceAvailable && sourceNode) {
                              const sourceIdClean = sourceNode.id.replace(/-/g, '_');
                              let sourceVarName: string | null = null;
                              let sourceType = sourceNode.data.outputType;

                              // --- GLOBAL VAR CHECK ---
                              if (sourceNode.data.isGlobalVar) {
                                  sourceVarName = sourceNode.data.globalName || `u_global_${sourceIdClean}`;
                                  sourceType = sourceNode.data.outputType;
                              } else {
                                  const targetOutputId = edge.sourceHandle || 'out';
                                  const sourceOutputs = sourceNode.data.outputs || [{ id: 'out', type: sourceNode.data.outputType }];
                                  const outputDef = sourceOutputs.find(o => o.id === targetOutputId);

                                  if (outputDef) {
                                      sourceVarName = `out_${sourceIdClean}_${outputDef.id}`;
                                      sourceType = outputDef.type;
                                  }
                              }
                              
                              if (sourceVarName) {
                                  const targetType = sanitizeType(input.type);
                                  callArgs.push(castGLSLVariable(sourceVarName, sanitizeType(sourceType), targetType));
                              } else {
                                  callArgs.push(getDefaultGLSLValue(input.type));
                              }
                          } else {
                               callArgs.push(getDefaultGLSLValue(input.type));
                          }
                      } else {
                          callArgs.push(getDefaultGLSLValue(input.type));
                      }
                  }
              });

              const outVar = `out_${nodeIdClean}_result`;
              mainBodyCode += `  vec4 ${outVar};\n`;
              const args = ['uv', ...callArgs, outVar];
              mainBodyCode += `  ${funcName}(${args.join(', ')});\n`;
              return;
          }
          
          // 1. Prepare Arguments
          const callArgs: string[] = ['uv']; 

          (node.data.inputs || []).forEach(input => {
              const passTextureUniform = inputTextureUniforms[`${node.id}_${input.id}`];
              if (passTextureUniform) {
                  if (input.type === 'sampler2D') {
                      callArgs.push(passTextureUniform);
                  } else {
                      const sample = `texture(${passTextureUniform}, uv)`;
                      callArgs.push(castGLSLVariable(sample, 'vec4', sanitizeType(input.type)));
                  }
              } else {
                  const edge = edges.find(e => e.target === node.id && e.targetHandle === input.id);

                  // Array element override support: connect to `${input.id}__${index}`
                  const safeInputType = sanitizeType(input.type);
                  const isArrayInput = isArrayType(safeInputType);
                  const elementEdges = (!edge && isArrayInput) ? collectArrayElementEdges(node.id, input.id) : [];
                  const uVal = node.data.uniforms && node.data.uniforms[input.id] ? node.data.uniforms[input.id] : null;
                  const uniformName = uVal ? `u_${nodeIdClean}_${input.id}` : null;
                  const arrayEmit = (!edge && elementEdges.length > 0 && isArrayInput)
                      ? emitArrayVarFromElementEdges({ nodeIdClean, input, elementEdges, uniformName, uniformVal: uVal })
                      : { handled: false, code: '' as string, arg: undefined as string | undefined };
                  if (!edge && arrayEmit.handled) {
                      mainBodyCode += arrayEmit.code;
                      if (arrayEmit.arg) callArgs.push(arrayEmit.arg);
                      return;
                  }

                  // Check if source node exists in Local Graph to prevent dead links from breaking compilation
                  // caused by Cycle Breaker above
                  if (edge) {
                      const sourceNode = getNodeById(edge.source);
                      // IMPORTANT: Only link if source node was successfully visited and added to localNodes
                      const isSourceAvailable = sourceNode && localNodes.some(n => n.id === sourceNode.id);

                      if (isSourceAvailable && sourceNode) {
                          const sourceIdClean = sourceNode.id.replace(/-/g, '_');
                          let sourceVarName: string | null = null;
                          let sourceType = sourceNode.data.outputType;

                          // --- GLOBAL VAR CHECK ---
                          if (sourceNode.data.isGlobalVar) {
                              sourceVarName = sourceNode.data.globalName || `u_global_${sourceIdClean}`;
                              sourceType = sourceNode.data.outputType;
                          } else {
                              const targetOutputId = edge.sourceHandle || 'out';
                              const sourceOutputs = sourceNode.data.outputs || [{ id: 'out', type: sourceNode.data.outputType }];
                              const outputDef = sourceOutputs.find(o => o.id === targetOutputId);

                              if (outputDef) {
                                  sourceVarName = `out_${sourceIdClean}_${outputDef.id}`;
                                  sourceType = outputDef.type;
                              }
                          }

                          if (sourceVarName) {
                              const targetType = sanitizeType(input.type);
                              callArgs.push(castGLSLVariable(sourceVarName, sanitizeType(sourceType), targetType));
                          } else {
                               // Fallback to uniform if source not found (cycle broken)
                               if (node.data.uniforms && node.data.uniforms[input.id]) {
                                   const uniformName = `u_${nodeIdClean}_${input.id}`;
                                   const actualType = node.data.uniforms[input.id].type;
                                   callArgs.push(castGLSLVariable(uniformName, sanitizeType(actualType), input.type));
                               } else {
                                   callArgs.push(getDefaultGLSLValue(input.type));
                               }
                          }
                      } else {
                           // Fallback to uniform if source not found (cycle broken)
                           if (node.data.uniforms && node.data.uniforms[input.id]) {
                               const uniformName = `u_${nodeIdClean}_${input.id}`;
                               const actualType = node.data.uniforms[input.id].type;
                               callArgs.push(castGLSLVariable(uniformName, sanitizeType(actualType), input.type));
                           } else {
                               callArgs.push(getDefaultGLSLValue(input.type));
                           }
                      }
                  } else {
                      if (node.data.uniforms && node.data.uniforms[input.id]) {
                          const uniformName = `u_${nodeIdClean}_${input.id}`;
                          const actualType = node.data.uniforms[input.id].type;
                          const targetType = sanitizeType(input.type);
                          callArgs.push(castGLSLVariable(uniformName, sanitizeType(actualType), targetType));
                      } else {
                          callArgs.push(getDefaultGLSLValue(input.type));
                      }
                  }
              }
          });

          // 2. Declare Output Variables
          const outputArgs: string[] = [];
          // Allow empty outputs if explicitly defined (e.g. Compound Nodes), otherwise fallback to default
          const outputs = node.data.outputs !== undefined 
              ? node.data.outputs 
              : [{ id: 'out', name: 'Output', type: node.data.outputType }];

          outputs.forEach(outDef => {
              const varName = `out_${nodeIdClean}_${outDef.id}`;
              const safeType = sanitizeType(outDef.type);
              mainBodyCode += `  ${safeType} ${varName};\n`;
              outputArgs.push(varName);
          });

          // 3. Generate Call
          const allArgs = [...callArgs, ...outputArgs];
          mainBodyCode += `  ${funcName}(${allArgs.join(', ')});\n`;
      });

      // Final Output
    const targetIdClean = nodeId.replace(/-/g, '_');
    const targetNode = getNodeById(nodeId);
      
      let finalVar = `out_${targetIdClean}_out`;
      let finalType: GLSLType = 'vec4';
      
      if (targetNode) {
          if (targetNode.type === 'graphOutput') {
               finalVar = `out_${targetIdClean}_result`;
               finalType = 'vec4';
          } else {
              const outDef = getNodeOutputDef(targetNode, requestedOutputId);
              finalVar = `out_${targetIdClean}_${outDef.id}`;
              finalType = outDef.type;
          }
      }
      
      mainBodyCode += `  fragColor = ${castGLSLVariable(finalVar, sanitizeType(finalType), 'vec4')};\n}`;

      passes.push({
          id: passKey,
          vertexShader: DEFAULT_VERTEX_SHADER,
          fragmentShader: header + functionsCode + mainBodyCode,
          uniforms: globalUniforms,
          outputTo: 'FBO', // Always render to specific FBO so it can be referenced by other nodes (like BakeNode)
          inputTextureUniforms
      });

      activePassStack.delete(passKey);
      processedPassIDs.add(passKey);
      return passKey;
  };

  try {
      generatePassForNode(targetNodeId);
      return { passes }; 
  } catch (e: any) {
      console.error(e);
      return { passes: [], error: e.message };
  }
};
