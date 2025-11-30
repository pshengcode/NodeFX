import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { NodeData, GLSLType, UniformVal, UniformValueType } from '../types';
import { extractAllSignatures } from '../utils/glslParser';
import { inferGraphInputNodes, inferGraphOutputNodes } from '../utils/inferenceHelpers';

// Helper to sanitize types (Duplicate from shaderCompiler to avoid circular deps if any, or just for safety)
const sanitizeType = (type: string): GLSLType => {
  if (!type) return 'float';
  if (type === 'vec1') return 'float';
  const validTypes = ['float', 'int', 'vec2', 'vec3', 'vec4', 'sampler2D', 'bool'];
  return validTypes.includes(type) ? (type as GLSLType) : 'float';
};

// Helper to rank types for polymorphism
const getTypeRank = (type: GLSLType): number => {
    switch (type) {
        case 'float': return 1;
        case 'int': return 1; // Treat int as float-compatible for rank
        case 'vec2': return 2;
        case 'vec3': return 3;
        case 'vec4': return 4;
        default: return 0;
    }
};

const getRankType = (rank: number): GLSLType => {
    switch (rank) {
        case 1: return 'float';
        case 2: return 'vec2';
        case 3: return 'vec3';
        case 4: return 'vec4';
        default: return 'float';
    }
};

// Helper to migrate uniform values between types
const migrateUniformValue = (u: UniformVal | undefined, newType: GLSLType): UniformVal => {
    let newVal: UniformValueType = 0;
    
    // Check if u exists and value is numeric (number or array of numbers)
    // We skip complex types like textures or strings for auto-migration logic
    let isNumeric = false;
    if (u && u.value !== null) {
        if (typeof u.value === 'number') {
            isNumeric = true;
        } else if (Array.isArray(u.value)) {
            isNumeric = true;
        }
    }

    if (isNumeric && u) {
        // Perform conversion
        const val = u.value as number | number[];
        const isArray = Array.isArray(val);
        const isTargetScalar = newType === 'float' || newType === 'int';

        if (isTargetScalar) {
             // Vector -> Scalar
             if (isArray && (val as number[]).length > 0) newVal = (val as number[])[0];
             else if (isArray) newVal = 0;
             else newVal = val as number;
        } else {
             // Scalar/Vector -> Vector
             const targetLen = parseInt(newType.slice(3)); // vec2->2, vec3->3, vec4->4
             if (!isArray) {
                 // Scalar -> Vector
                 newVal = Array(targetLen).fill(val);
             } else {
                 // Vector -> Vector
                 const current = [...(val as number[])];
                 while(current.length < targetLen) current.push(0);
                 newVal = current.slice(0, targetLen);
             }
        }
    } else {
        // Create default
        const targetLen = newType === 'float' || newType === 'int' ? 1 : parseInt(newType.slice(3));
        newVal = targetLen === 1 ? 0 : Array(targetLen).fill(0);
    }
    return {
        type: newType,
        value: newVal,
        widget: u?.widget,
        widgetConfig: u?.widgetConfig
    };
};

export function useTypeInference() {
    const runTypeInference = useCallback((
        currentNodes: Node<NodeData>[], 
        currentEdges: Edge[]
    ): Node<NodeData>[] | null => {
        let nodes = [...currentNodes];
        const nodeMap = new Map(nodes.map(n => [n.id, n]));

        // --- STEP 1: GraphInput Inference (Reverse) ---
        const hasInputUpdates = inferGraphInputNodes(nodes, nodeMap, currentEdges);

        // --- STEP 2: Standard Forward Inference ---
        let hasStandardUpdates = false;
        
        // We use 'nodes' which might have been updated by Step 1
        const updatedNodes = nodes.map(node => {
            // Only process nodes flagged with autoType
            if (!node.data.autoType) return node;

            // Find all incoming edges to this node
            const incomingEdges = currentEdges.filter(e => e.target === node.id);
            
            let maxRank = 1; // Default to float
            let connected = false;

            incomingEdges.forEach(edge => {
                const sourceNode = nodeMap.get(edge.source); // Use updated map
                if (sourceNode) {
                    // Correctly identify the specific output type
                    let typeToCheck = sourceNode.data.outputType;
                    
                    if (edge.sourceHandle && sourceNode.data.outputs) {
                        const outputDef = sourceNode.data.outputs.find(o => o.id === edge.sourceHandle);
                        if (outputDef) {
                            typeToCheck = outputDef.type;
                        }
                    }
                    // Special case for GraphInput: it uses inputs as outputs
                    if (sourceNode.type === 'graphInput' && edge.sourceHandle) {
                         const inputDef = sourceNode.data.inputs.find(i => i.id === edge.sourceHandle);
                         if (inputDef) {
                             typeToCheck = inputDef.type;
                         }
                    }

                    // Sanitize and Rank
                    const safeType = sanitizeType(typeToCheck);
                    const rank = getTypeRank(safeType);
                    
                    // Logic: Upgrade to highest dimension connected
                    if (rank > maxRank) maxRank = rank;
                    connected = true;
                }
            });

            // STICKY TYPE STRATEGY:
            // If nothing is connected, we do NOT change the type.
            if (!connected) {
                 return node;
            }

            const targetType = getRankType(maxRank);

            // --- NEW LOGIC: Signature Lookup ---
            // 1. Parse all signatures from the node's GLSL
            const signatures = extractAllSignatures(node.data.glsl);
            
            // 2. Find the best matching signature
            // We look for a signature where the first input matches the targetType
            let matchedSig = signatures.find(sig => 
                sig.inputs.length > 0 && sig.inputs[0].type === targetType
            );

            // Fallback: If no exact match, try to find one that matches the rank? 
            if (!matchedSig && signatures.length > 0) {
                matchedSig = signatures.find(sig => 
                    sig.inputs.length > 0 && getTypeRank(sig.inputs[0].type) === maxRank
                );
            }
            
            let newInputs = node.data.inputs;
            let newOutputs = node.data.outputs || [];
            let newOutputType = node.data.outputType;

            if (matchedSig) {
                // Use the signature's definition
                newInputs = matchedSig.inputs;
                newOutputs = matchedSig.outputs;
                if (newOutputs.length > 0) {
                    newOutputType = newOutputs[0].type;
                }
            } else {
                // Fallback to blind upgrade (Old Logic)
                newInputs = node.data.inputs.map(i => ({ ...i, type: targetType }));
                newOutputs = node.data.outputs ? node.data.outputs.map(o => ({ ...o, type: targetType })) : [];
                newOutputType = targetType;
            }

            // Check if update is needed
            const inputsChanged = JSON.stringify(node.data.inputs) !== JSON.stringify(newInputs);
            const outputsChanged = JSON.stringify(node.data.outputs) !== JSON.stringify(newOutputs);
            const outputTypeChanged = node.data.outputType !== newOutputType;
            
            // Check if uniforms need update (types might have changed)
            const uniformsNeedUpdate = newInputs.some(input => {
                const u = node.data.uniforms[input.id];
                return !u || u.type !== input.type;
            });

            if (inputsChanged || outputsChanged || outputTypeChanged || uniformsNeedUpdate) {
                hasStandardUpdates = true;

                // Migrate Uniform Values
                const nextUniforms = { ...node.data.uniforms };

                newInputs.forEach(input => {
                    const u = nextUniforms[input.id];
                    nextUniforms[input.id] = migrateUniformValue(u, input.type);
                });

                // Update nodeMap for subsequent steps
                const newNode = {
                    ...node,
                    data: {
                        ...node.data,
                        outputType: newOutputType,
                        inputs: newInputs,
                        outputs: newOutputs,
                        uniforms: nextUniforms
                    }
                };
                nodeMap.set(node.id, newNode);
                return newNode;
            }

            return node;
        });

        // --- STEP 3: GraphOutput Inference (Forward) ---
        // We use updatedNodes from Step 2
        const hasOutputUpdates = inferGraphOutputNodes(updatedNodes, nodeMap, currentEdges);

        if (hasInputUpdates || hasStandardUpdates || hasOutputUpdates) {
            return updatedNodes;
        }
        return null;
    }, []);

    return { runTypeInference };
}
