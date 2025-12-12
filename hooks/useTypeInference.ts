import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { NodeData } from '../types';
import { extractAllSignatures } from '../utils/glslParser';
import { 
    inferGraphInputNodes, 
    inferGraphOutputNodes, 
    getConnectedTypeRank, 
    getRankType, 
    getTypeRank, 
    migrateUniformValue 
} from '../utils/inferenceHelpers';

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

            // Use helper to determine target rank based on connections (Forward & Reverse)
            const { rank: maxRank, isConnected } = getConnectedTypeRank(node, currentEdges, nodeMap);

            // STICKY TYPE STRATEGY:
            // If nothing is connected, we do NOT change the type.
            if (!isConnected) {
                 return node;
            }

            const targetType = getRankType(maxRank);

            // --- NEW LOGIC: Signature Lookup ---
            // 1. Parse all signatures from the node's GLSL
            const signatures = extractAllSignatures(node.data.glsl);
            
            // 2. Find the best matching signature based on ALL connections
            let matchedSig = null;
            let bestMatchScore = -1;

            // Get all incoming edges for this node
            const incomingEdges = currentEdges.filter(e => e.target === node.id);

            // Helper to check if sig matches current inputs
            const isCurrentSignature = (sig: any) => {
                if (sig.inputs.length !== node.data.inputs.length) return false;
                return sig.inputs.every((inp: any, i: number) => inp.id === node.data.inputs[i].id && inp.type === node.data.inputs[i].type);
            };

            for (const sig of signatures) {
                let score = 0;
                let isCompatible = true;

                // Check each input in the signature
                for (let i = 0; i < sig.inputs.length; i++) {
                    const sigInput = sig.inputs[i];
                    
                    // Find if there is an edge connected to this input
                    // Note: sigInput.id might not match edge.targetHandle if names changed, 
                    // but usually they should match if autoType is working correctly.
                    // However, autoType usually updates inputs to match signature names.
                    // If inputs are not yet updated, we might need to match by index?
                    // Let's try matching by ID first.
                    const edge = incomingEdges.find(e => e.targetHandle === sigInput.id);
                    
                    if (edge) {
                        const sourceNode = nodeMap.get(edge.source);
                        if (sourceNode) {
                            let sourceType = sourceNode.data.outputType;
                            if (edge.sourceHandle) {
                                const out = sourceNode.data.outputs?.find(o => o.id === edge.sourceHandle);
                                if (out) sourceType = out.type;
                                if (sourceNode.type === 'graphInput') {
                                    const inp = sourceNode.data.inputs.find(i => i.id === edge.sourceHandle);
                                    if (inp) sourceType = inp.type;
                                }
                            }
                            
                            // Check compatibility
                            if (sourceType === sigInput.type) {
                                score += 10; // Exact match
                            } else if (sigInput.type === 'sampler2D') {
                                // Multi-pass support: Allow connecting value types to sampler2D
                                score += 5; 
                            } else if (sourceType === 'sampler2D') {
                                // Sampler source can only match Sampler target (handled in first if)
                                isCompatible = false;
                            } else if (getTypeRank(sourceType) <= getTypeRank(sigInput.type)) {
                                score += 1; // Compatible (can cast up)
                            } else {
                                // Incompatible (e.g. vec4 -> vec2)
                                if (getTypeRank(sourceType) > getTypeRank(sigInput.type)) isCompatible = false;
                            }
                        }
                    }
                }

                if (isCompatible) {
                    if (score > bestMatchScore) {
                        bestMatchScore = score;
                        matchedSig = sig;
                    } else if (score === bestMatchScore) {
                        // Tie-breaking: Prefer current signature if scores are equal
                        // This prevents switching signatures when adding a common input (like tDiffuse)
                        if (isCurrentSignature(sig)) {
                            matchedSig = sig;
                        }
                    }
                }
            }

            // If this node has connections but NO incoming edges, the score-based matching
            // above can't differentiate overloads. Prefer matching by the connected rank.
            if (incomingEdges.length === 0 && isConnected && signatures.length > 0) {
                matchedSig =
                    signatures.find(sig => sig.outputs?.length > 0 && getTypeRank(sig.outputs[0].type) === maxRank) ||
                    signatures.find(sig => sig.inputs.length > 0 && getTypeRank(sig.inputs[0].type) === maxRank) ||
                    matchedSig;
            }

            // Fallback: If no connections or no match found, keep current or try rank-based
            if (!matchedSig && signatures.length > 0 && !isConnected) {
                 // If not connected, maybe default to the first one? Or keep current?
                 // Let's keep current behavior: don't change if not connected.
            } else if (!matchedSig && signatures.length > 0 && isConnected) {
                 // Connected but no perfect match found via edges (maybe edges are new?)
                 // Try the old rank-based fallback for the first input
                      matchedSig = signatures.find(sig => {
                          const inputRankMatches = sig.inputs.length > 0 && getTypeRank(sig.inputs[0].type) === maxRank;
                          const outputRankMatches = sig.outputs?.length > 0 && getTypeRank(sig.outputs[0].type) === maxRank;
                          return outputRankMatches || inputRankMatches;
                      });
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
