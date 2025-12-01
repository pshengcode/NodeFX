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
