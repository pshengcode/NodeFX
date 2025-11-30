import { Node, Edge } from 'reactflow';
import { NodeData, GLSLType, UniformVal, UniformValueType } from '../types';

// Helper to sanitize types
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
        case 'int': return 1;
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
    let isNumeric = false;
    if (u && u.value !== null) {
        if (typeof u.value === 'number') {
            isNumeric = true;
        } else if (Array.isArray(u.value)) {
            isNumeric = true;
        }
    }

    if (isNumeric && u) {
        const val = u.value as number | number[];
        const isArray = Array.isArray(val);
        const isTargetScalar = newType === 'float' || newType === 'int';

        if (isTargetScalar) {
             if (isArray && (val as number[]).length > 0) newVal = (val as number[])[0];
             else if (isArray) newVal = 0;
             else newVal = val as number;
        } else {
             const targetLen = parseInt(newType.slice(3));
             if (!isArray) {
                 newVal = Array(targetLen).fill(val);
             } else {
                 const current = [...(val as number[])];
                 while(current.length < targetLen) current.push(0);
                 newVal = current.slice(0, targetLen);
             }
        }
    } else {
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

// --- INFERENCE LOGIC ---

export const inferGraphInputNodes = (
    nodes: Node<NodeData>[], 
    nodeMap: Map<string, Node<NodeData>>, 
    edges: Edge[]
): boolean => {
    let hasUpdates = false;

    nodes.forEach((node, index) => {
        if (node.type !== 'graphInput') return;
        
        const groupNodeId = node.data.scopeId;
        const groupNode = groupNodeId ? nodeMap.get(groupNodeId) : null;
        
        let inputUpdates = false;
        const newInputs = node.data.inputs.map(inputDef => {
            const connectedEdges = edges.filter(e => e.source === node.id && e.sourceHandle === inputDef.id);
            if (connectedEdges.length === 0) return inputDef;

            let maxRank = 0;

            connectedEdges.forEach(edge => {
                const targetNode = nodeMap.get(edge.target);
                if (!targetNode) return;
                
                const targetInput = targetNode.data.inputs.find(i => i.id === edge.targetHandle);
                if (targetInput) {
                    const rank = getTypeRank(targetInput.type);
                    if (rank > maxRank) maxRank = rank;
                }
            });

            if (maxRank > 0) {
                const bestType = getRankType(maxRank);
                if (bestType !== inputDef.type) {
                    inputUpdates = true;
                    return { ...inputDef, type: bestType };
                }
            }
            return inputDef;
        });

        if (inputUpdates) {
            hasUpdates = true;
            
            // Update GraphInput Node
            nodes[index] = {
                ...node,
                data: { ...node.data, inputs: newInputs }
            };
            nodeMap.set(node.id, nodes[index]);

            // Update Group Node
            if (groupNode) {
                const groupIndex = nodes.findIndex(n => n.id === groupNode.id);
                if (groupIndex !== -1) {
                    const nextUniforms = { ...groupNode.data.uniforms };
                    newInputs.forEach(inp => {
                        const oldInp = groupNode.data.inputs.find(i => i.id === inp.id);
                        if (oldInp && oldInp.type !== inp.type) {
                            const u = nextUniforms[inp.id];
                            nextUniforms[inp.id] = migrateUniformValue(u, inp.type);
                        }
                    });

                    nodes[groupIndex] = {
                        ...groupNode,
                        data: { 
                            ...groupNode.data, 
                            inputs: newInputs,
                            uniforms: nextUniforms
                        }
                    };
                    nodeMap.set(groupNode.id, nodes[groupIndex]);
                }
            }
        }
    });

    return hasUpdates;
};

export const inferGraphOutputNodes = (
    nodes: Node<NodeData>[], 
    nodeMap: Map<string, Node<NodeData>>, 
    edges: Edge[]
): boolean => {
    let hasUpdates = false;

    nodes.forEach((node, index) => {
        if (node.type !== 'graphOutput') return;

        const groupNodeId = node.data.scopeId;
        const groupNode = groupNodeId ? nodeMap.get(groupNodeId) : null;
        
        let outputUpdates = false;
        const newOutputs = (node.data.outputs || []).map(outputDef => {
            const edge = edges.find(e => e.target === node.id && e.targetHandle === outputDef.id);
            
            if (!edge) return outputDef;

            const sourceNode = nodeMap.get(edge.source);
            if (!sourceNode) return outputDef;

            let sourceType = sourceNode.data.outputType;
            if (edge.sourceHandle) {
                const sourceOutput = sourceNode.data.outputs?.find(o => o.id === edge.sourceHandle);
                if (sourceOutput) sourceType = sourceOutput.type;
                
                if (sourceNode.type === 'graphInput') {
                     const sourceInput = sourceNode.data.inputs.find(i => i.id === edge.sourceHandle);
                     if (sourceInput) sourceType = sourceInput.type;
                }
            }

            const safeSourceType = sanitizeType(sourceType);
            
            if (safeSourceType !== outputDef.type) {
                outputUpdates = true;
                return { ...outputDef, type: safeSourceType };
            }
            return outputDef;
        });

        if (outputUpdates) {
            hasUpdates = true;
            
            // Update GraphOutput Node
            nodes[index] = {
                ...node,
                data: { ...node.data, outputs: newOutputs }
            };
            nodeMap.set(node.id, nodes[index]);

            // Update Group Node
            if (groupNode) {
                const groupIndex = nodes.findIndex(n => n.id === groupNode.id);
                if (groupIndex !== -1) {
                    nodes[groupIndex] = {
                        ...groupNode,
                        data: { 
                            ...groupNode.data, 
                            outputs: newOutputs 
                        }
                    };
                    nodeMap.set(groupNode.id, nodes[groupIndex]);
                }
            }
        }
    });

    return hasUpdates;
};
