
import { Edge, Node } from 'reactflow';
import { NodeData, CompilationResult, GLSLType, RenderPass, UniformVal, NodeOutput, UniformValueType } from '../types';
import { DEFAULT_VERTEX_SHADER, GLSL_BUILTINS } from '../constants';
import { generateGradientTexture, generateCurveTexture } from './textureGen';
import { stripComments } from './glslParser';

// Helper to sanitize types
const sanitizeType = (type: string): GLSLType => {
  if (type === 'vec1') return 'float';
  const validTypes = ['float', 'int', 'vec2', 'vec3', 'vec4', 'sampler2D', 'vec2[]'];
  return validTypes.includes(type) ? (type as GLSLType) : 'float';
};

// Default values
const getDefaultGLSLValue = (type: GLSLType): string => {
  const safeType = sanitizeType(type);
  switch (safeType) {
    case 'float': return '0.0';
    case 'int': return '0';
    case 'vec2': return 'vec2(0.0)';
    case 'vec3': return 'vec3(0.0)';
    case 'vec4': return 'vec4(0.0, 0.0, 0.0, 1.0)';
    case 'sampler2D': return 'u_empty_tex'; 
    case 'vec2[]': {
        const zeros = Array(16).fill('vec2(0.0)').join(', ');
        return `vec2[16](${zeros})`;
    }
    default: return '0.0';
  }
};

const getUniformValue = (type: GLSLType, val: UniformValueType) => {
  if (type === 'vec3' && Array.isArray(val)) return new Float32Array(val);
  if (type === 'vec4' && Array.isArray(val)) return new Float32Array(val);
  if (type === 'vec2' && Array.isArray(val)) return new Float32Array(val);
  if (type === 'vec2[]' && Array.isArray(val)) {
      const flat = val.flat();
      return new Float32Array(flat as number[]);
  }
  return val;
};

// Type Casting Logic
const castGLSLVariable = (varName: string, fromType: GLSLType, toType: GLSLType): string => {
    if (fromType === toType) return varName;
    if (fromType === 'float') {
        if (toType === 'vec2') return `vec2(${varName})`;
        if (toType === 'vec3') return `vec3(${varName})`;
        if (toType === 'vec4') return `vec4(vec3(${varName}), 1.0)`; 
        if (toType === 'int') return `int(${varName})`;
    }
    if (fromType === 'int') {
        if (toType === 'float') return `float(${varName})`;
        if (toType === 'vec2') return `vec2(float(${varName}))`;
        if (toType === 'vec3') return `vec3(float(${varName}))`;
        if (toType === 'vec4') return `vec4(vec3(float(${varName})), 1.0)`;
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
    outputs: { type: string; id: string }[] = []
): string => {
    const args = ['vec2 uv'];
    
    inputs.forEach(i => {
        if (i.type === 'vec2[]') {
            args.push(`vec2 ${i.id}[16]`);
        } else {
            args.push(`${i.type} ${i.id}`);
        }
    });
    outputs.forEach(o => args.push(`out ${o.type} ${o.id}`));
    
    return `void ${funcName}(${args.join(', ')})`;
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
        compoundNode.data.outputs || []
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

  // Stack to detect Pass-Level Cycles (Texture Feedback)
  const activePassStack = new Set<string>();

  // Recursive function to generate passes
  const generatePassForNode = (currentNodeId: string): string => {
      // 1. Cache Check
      if (processedPassIDs.has(currentNodeId)) return currentNodeId;

      // 2. Cycle Detection (Pass Level)
      if (activePassStack.has(currentNodeId)) {
          console.warn(`[Compiler] Pass Cycle detected at node ${currentNodeId}. Breaking loop.`);
          // Return id but do NOT recurse. The texture uniform will effectively be the "previous frame" 
          // (or null if not rendered yet) which effectively allows feedback-like behavior without infinite compilation.
          return currentNodeId; 
      }

      const currentNode = getNodeById(currentNodeId);
      if (!currentNode) throw new Error(`Node ${currentNodeId} not found`);

      activePassStack.add(currentNodeId);

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

              const sourceType = sanitizeType(sourceNode.data.outputType);
              const targetType = sanitizeType(targetHandle.type);

              // DETECT PASS BOUNDARY
              if (targetType === 'sampler2D' && sourceType !== 'sampler2D') {
                  // Pass Boundary found -> Recurse to create new pass
                  const dependencyPassId = generatePassForNode(edge.source);
                  const uniformName = `u_pass_${dependencyPassId.replace(/-/g, '_')}_tex`;
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
          traverseLocal(currentNodeId);
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

// Shadertoy compatibility
#define iTime u_time
#define iResolution vec3(u_resolution, 1.0)
`;

      // Helper to get actual value for uniforms
      const getDefaultUniformValue = (type: GLSLType) => {
          if (type === 'vec2') return new Float32Array([0,0]);
          if (type === 'vec3') return new Float32Array([0,0,0]);
          if (type === 'vec4') return new Float32Array([0,0,0,1]);
          return 0;
      };

      const globalUniforms: Record<string, { type: GLSLType; value: UniformValueType }> = {};

      const uniqueTextureUniforms = new Set(Object.values(inputTextureUniforms));
      uniqueTextureUniforms.forEach(uName => {
          header += `uniform sampler2D ${uName};\n`;
      });

      const injectUniformsRecursive = (n: Node<NodeData>) => {
          const nodeIdClean = n.id.replace(/-/g, '_');
          
          // Handle Global Vars
          if (n.data.isGlobalVar) {
                const name = n.data.globalName || `u_global_${nodeIdClean}`;
                const type = sanitizeType(n.data.outputType || 'float');
                
                if (!globalUniforms[name]) {
                    header += `uniform ${type} ${name};\n`;
                    
                    let val = n.data.value;
                    if (val === undefined && n.data.uniforms && n.data.uniforms['value']) {
                        val = n.data.uniforms['value'].value;
                    }
                    if (val === undefined) val = getDefaultUniformValue(type);
                    globalUniforms[name] = { type, value: getUniformValue(type, val) };
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

                 if (safeType === 'vec2[]') {
                     header += `uniform vec2 ${uniformName}[16];\n`;
                 } else {
                     header += `uniform ${safeType} ${uniformName};\n`;
                 }
                 
                 let val = getUniformValue(safeType, uVal.value);
                 
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
                            uVal.widgetConfig.curvePointsB
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
                             uVal.widgetConfig.curvePointsB
                         );
                     }

                     if (textureData) {
                         const centerIdx = Math.floor(w / 2) * 4;
                         const r = textureData.data[centerIdx] / 255;
                         const g = textureData.data[centerIdx + 1] / 255;
                         const b = textureData.data[centerIdx + 2] / 255;
                         const a = textureData.data[centerIdx + 3] / 255;

                         if (safeType === 'vec4') val = new Float32Array([r,g,b,a]);
                         else if (safeType === 'vec3') val = new Float32Array([r,g,b]);
                         else if (safeType === 'float') val = r;
                     }
                 }

                 globalUniforms[uniformName] = { type: safeType, value: val };
             }
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
            
            const sig = generateFunctionSignature(mainFuncName, [], outputs);
            
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
                [{ id: 'result', type: 'vec4' }]
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

        // 3. Rename Main 'run' Function
        const runRegex = /\bvoid\s+run\s*\(/g;
        if (runRegex.test(userCode)) {
            userCode = userCode.replace(runRegex, `void ${mainFuncName}(`);
        } else {
             userCode = `void ${mainFuncName}(vec2 uv, out vec4 out_fallback) { out_fallback = vec4(0.0); }`;
        }

        functionsCode += `// Node: ${node.data.label}\n${userCode}\n\n`;
      });

      // --- MAIN LOOP ---
      mainBodyCode += `void main() {\n  vec2 uv = vUv;\n`;

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
                      callArgs.push(passTextureUniform);
                  } else {
                      const edge = edges.find(e => e.target === node.id && e.targetHandle === input.id);
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
                  callArgs.push(passTextureUniform);
              } else {
                  const edge = edges.find(e => e.target === node.id && e.targetHandle === input.id);
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
      const targetIdClean = currentNodeId.replace(/-/g, '_');
      const targetNode = getNodeById(currentNodeId);
      
      let finalVar = `out_${targetIdClean}_out`;
      let finalType: GLSLType = 'vec4';
      
      if (targetNode) {
          if (targetNode.type === 'graphOutput') {
               finalVar = `out_${targetIdClean}_result`;
               finalType = 'vec4';
          } else {
              const outs = targetNode.data.outputs || [];
              if (outs.length > 0) {
                  finalVar = `out_${targetIdClean}_${outs[0].id}`;
                  finalType = outs[0].type;
              }
          }
      }
      
      mainBodyCode += `  fragColor = ${castGLSLVariable(finalVar, sanitizeType(finalType), 'vec4')};\n}`;

      passes.push({
          id: currentNodeId,
          vertexShader: DEFAULT_VERTEX_SHADER,
          fragmentShader: header + functionsCode + mainBodyCode,
          uniforms: globalUniforms,
          outputTo: 'FBO', // Always render to specific FBO so it can be referenced by other nodes (like BakeNode)
          inputTextureUniforms
      });

      activePassStack.delete(currentNodeId);
      processedPassIDs.add(currentNodeId);
      return currentNodeId;
  };

  try {
      generatePassForNode(targetNodeId);
      return { passes }; 
  } catch (e: any) {
      console.error(e);
      return { passes: [], error: e.message };
  }
};
