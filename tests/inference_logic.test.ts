
// @vitest-environment node
import { describe, it, expect } from 'vitest';
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

// Re-implement the logic from useTypeInference.ts as a pure function for testing
const runTypeInference = (
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

        for (const sig of signatures) {
            let score = 0;
            let isCompatible = true;

            // Check each input in the signature
            for (let i = 0; i < sig.inputs.length; i++) {
                const sigInput = sig.inputs[i];
                
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
                        } else if (getTypeRank(sourceType) <= getTypeRank(sigInput.type)) {
                            score += 1; // Compatible (can cast up)
                        } else {
                            if (sigInput.type === 'sampler2D' && sourceType !== 'sampler2D') isCompatible = false;
                            else if (sourceType === 'sampler2D' && sigInput.type !== 'sampler2D') isCompatible = false;
                            else if (getTypeRank(sourceType) > getTypeRank(sigInput.type)) isCompatible = false;
                        }
                    }
                }
            }

            if (isCompatible && score > bestMatchScore) {
                bestMatchScore = score;
                matchedSig = sig;
            }
        }

        // Fallback
        if (!matchedSig && signatures.length > 0 && isConnected) {
             matchedSig = signatures.find(sig => 
                sig.inputs.length > 0 && getTypeRank(sig.inputs[0].type) === maxRank
            );
        }
        
        let newInputs = node.data.inputs;
        let newOutputs = node.data.outputs || [];
        let newOutputType = node.data.outputType;

        if (matchedSig) {
            newInputs = matchedSig.inputs;
            newOutputs = matchedSig.outputs;
            if (newOutputs.length > 0) {
                newOutputType = newOutputs[0].type;
            }
        }

        const inputsChanged = JSON.stringify(node.data.inputs) !== JSON.stringify(newInputs);
        const outputsChanged = JSON.stringify(node.data.outputs) !== JSON.stringify(newOutputs);
        const outputTypeChanged = node.data.outputType !== newOutputType;
        
        const uniformsNeedUpdate = newInputs.some(input => {
            const u = node.data.uniforms[input.id];
            return !u || u.type !== input.type;
        });

        if (inputsChanged || outputsChanged || outputTypeChanged || uniformsNeedUpdate) {
            hasStandardUpdates = true;

            const nextUniforms = { ...node.data.uniforms };

            newInputs.forEach(input => {
                const u = nextUniforms[input.id];
                nextUniforms[input.id] = migrateUniformValue(u, input.type);
            });

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
    const hasOutputUpdates = inferGraphOutputNodes(updatedNodes, nodeMap, currentEdges);

    if (hasInputUpdates || hasStandardUpdates || hasOutputUpdates) {
        return updatedNodes;
    }
    return null;
};

describe('Type Inference Logic', () => {
    it('correctly selects sampler2D overload when connected to sampler2D', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'texSource',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Texture',
                    glsl: 'void run(vec2 uv, out vec4 c) { c = vec4(0.0); }', // Dummy
                    inputs: [],
                    outputs: [{ id: 'out', name: 'Out', type: 'sampler2D' }],
                    outputType: 'sampler2D',
                    uniforms: {},
                    autoType: false
                }
            },
            {
                id: 'target',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Target',
                    glsl: `
                        void run(vec2 uv, vec2 cartesian, out vec2 polar) { polar = cartesian; }
                        void run(vec2 uv, sampler2D cartesian, out vec4 color) { color = texture(cartesian, uv); }
                    `,
                    // Initially configured as vec2
                    inputs: [{ id: 'cartesian', name: 'Cartesian', type: 'vec2' }],
                    outputs: [{ id: 'polar', name: 'Polar', type: 'vec2' }],
                    outputType: 'vec2',
                    uniforms: {},
                    autoType: true
                }
            }
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'texSource', target: 'target', targetHandle: 'cartesian' }
        ];

        const updatedNodes = runTypeInference(nodes, edges);
        
        expect(updatedNodes).not.toBeNull();
        if (updatedNodes) {
            const updatedTarget = updatedNodes.find(n => n.id === 'target');
            // Should switch to sampler2D input and vec4 output
            expect(updatedTarget?.data.inputs[0].type).toBe('sampler2D');
            expect(updatedTarget?.data.outputType).toBe('vec4');
        }
    });

    it('correctly selects vec2 overload when connected to vec2', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'vecSource',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Vec2',
                    glsl: 'void run(vec2 uv, out vec2 c) { c = uv; }',
                    inputs: [],
                    outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
                    outputType: 'vec2',
                    uniforms: {},
                    autoType: false
                }
            },
            {
                id: 'target',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Target',
                    glsl: `
                        void run(vec2 uv, vec2 cartesian, out vec2 polar) { polar = cartesian; }
                        void run(vec2 uv, sampler2D cartesian, out vec4 color) { color = texture(cartesian, uv); }
                    `,
                    // Initially configured as sampler2D (wrong)
                    inputs: [{ id: 'cartesian', name: 'Cartesian', type: 'sampler2D' }],
                    outputs: [{ id: 'color', name: 'Color', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {},
                    autoType: true
                }
            }
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'vecSource', target: 'target', targetHandle: 'cartesian' }
        ];

        const updatedNodes = runTypeInference(nodes, edges);
        
        expect(updatedNodes).not.toBeNull();
        if (updatedNodes) {
            const updatedTarget = updatedNodes.find(n => n.id === 'target');
            // Should switch to vec2 input and vec2 output
            expect(updatedTarget?.data.inputs[0].type).toBe('vec2');
            expect(updatedTarget?.data.outputType).toBe('vec2');
        }
    });
});
