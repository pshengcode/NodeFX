import React, { useCallback } from 'react';
import { 
    Node, 
    Edge, 
    NodeChange, 
    applyNodeChanges, 
    Connection, 
    addEdge, 
    NodeMouseHandler,
    NodeRemoveChange,
    ReactFlowInstance
} from 'reactflow';
import { NodeData, ShaderNodeDefinition, UniformVal, CompilationResult, SerializedNode, SerializedEdge } from '../types';
import { getNodeDefinition, validateNodeDefinition, normalizeNodeDefinition } from '../nodes/registry';
import { useTranslation } from 'react-i18next';

export function useGraphActions(
    nodes: Node<NodeData>[],
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    edges: Edge[],
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    previewNodeId: string | null,
    setPreviewNodeId: (id: string | null) => void,
    setCompiledData: (data: CompilationResult | null) => void,
    resolution: { w: number, h: number },
    reactFlowWrapper: React.RefObject<HTMLDivElement>,
    reactFlowInstance: ReactFlowInstance | null,
    fullRegistry: Record<string, ShaderNodeDefinition>,
    currentScope: string,
    setIsDragging: (dragging: boolean) => void
) {
    const { t } = useTranslation();

    // Custom onNodesChange to handle Group deletion (Ungroup Children)
    const onNodesChange = useCallback((changes: NodeChange[]) => {
        // Detect if this is a drag operation
        const hasDragging = changes.some(c => c.type === 'position' && (c as any).dragging === true);
        if (hasDragging && !changes.some(c => c.type === 'position' && (c as any).dragging === false)) {
            // Start of drag or during drag
            setIsDragging(true);
        } else if (changes.some(c => c.type === 'position' && (c as any).dragging === false)) {
            // End of drag
            setIsDragging(false);
        }
        
        setNodes((currentNodes) => {
            // FAST PATH: Position changes only (Drag optimization)
            // If all changes are position updates, we manually update only the affected nodes
            // to preserve object references for unchanged nodes. This prevents React.memo'd components from re-rendering.
            const isPositionOnly = changes.every(c => c.type === 'position');
            if (isPositionOnly) {
                const changeMap = new Map<string, any>();
                changes.forEach(c => {
                    if (c.type === 'position') {
                        changeMap.set(c.id, c);
                    }
                });

                return currentNodes.map(node => {
                    const change = changeMap.get(node.id);
                    if (change) {
                        // Only create new object for moved nodes
                        return {
                            ...node,
                            position: change.position || node.position,
                            positionAbsolute: change.positionAbsolute || node.positionAbsolute,
                            dragging: change.dragging ?? node.dragging
                        };
                    }
                    // Return exact same reference for unchanged nodes
                    return node;
                });
            }

            // COMPLEX PATH: Removals, Selection, Dimensions, etc.
            // Filter out invalid removals first (Protect GraphInput/Output)
            const validChanges = changes.filter(c => {
                if (c.type === 'remove') {
                    const node = currentNodes.find(n => n.id === c.id);
                    if (node && (node.type === 'graphInput' || node.type === 'graphOutput')) {
                        return false;
                    }
                }
                return true;
            });

            // 1. Separate remove changes
            const removeChanges = validChanges.filter(c => c.type === 'remove') as NodeRemoveChange[];
            const otherChanges = validChanges.filter(c => c.type !== 'remove');
            const nodesToRemove = new Set(removeChanges.map(c => c.id));

            // If no removals, standard behavior
            if (nodesToRemove.size === 0) {
                return applyNodeChanges(validChanges, currentNodes);
            }

            // Helper to find nearest surviving ancestor and calculate offset
            const findNewParentAndPos = (node: Node): { parentId: string | undefined, position: { x: number, y: number } } => {
                let currentParentId = node.parentId;
                let currentX = node.position.x;
                let currentY = node.position.y;
                
                // Traverse up while parent is being removed
                while (currentParentId && nodesToRemove.has(currentParentId)) {
                    const parent = currentNodes.find(n => n.id === currentParentId);
                    if (!parent) {
                        // Parent not found (data inconsistency), detach to root
                        currentParentId = undefined;
                        break;
                    }
                    
                    currentX += parent.position.x;
                    currentY += parent.position.y;
                    currentParentId = parent.parentId;
                }
                
                return { parentId: currentParentId, position: { x: currentX, y: currentY } };
            };

            // 2. Manually filter and update nodes (Bypass applyNodeChanges for removals to ensure safety)
            const survivingNodes: Node[] = [];
            
            currentNodes.forEach(node => {
                const isScheduledForRemoval = nodesToRemove.has(node.id);
                
                if (isScheduledForRemoval) {
                    // If the node is selected, the user explicitly wanted to delete it.
                    if (node.selected) {
                        return; // Let it die
                    }
                    
                    // If it's NOT selected, but scheduled for removal, it might be an implicit deletion (child of deleted parent).
                    // We want to rescue these nodes.
                    if (node.parentId && nodesToRemove.has(node.parentId)) {
                        const { parentId, position } = findNewParentAndPos(node);
                        survivingNodes.push({
                            ...node,
                            parentId,
                            position,
                            extent: undefined
                        });
                        return; // Rescued!
                    }
                    
                    // If not selected and not an implicit child deletion, respect the removal (e.g. programmatic)
                    return;
                }

                // Node is NOT scheduled for removal.
                // But we still need to check if its parent IS being removed (reparenting logic)
                if (node.parentId && nodesToRemove.has(node.parentId)) {
                    const { parentId, position } = findNewParentAndPos(node);
                    survivingNodes.push({
                        ...node,
                        parentId,
                        position,
                        extent: undefined
                    });
                } else {
                    // Keep as is
                    survivingNodes.push(node);
                }
            });

            // 3. Apply other changes (selection, position, etc.) to the surviving nodes
            return applyNodeChanges(otherChanges, survivingNodes);
        });
    }, [setNodes]);

    const onConnect = useCallback(
        (params: Connection) => {
            // Use reactFlowInstance to get nodes to avoid dependency on 'nodes' state
            // This prevents onConnect from changing on every node drag (position update)
            const sourceNode = reactFlowInstance?.getNode(params.source || '');
            const targetNode = reactFlowInstance?.getNode(params.target || '');
    
            if (!sourceNode || !targetNode) return;

            // --- RESTRICTION: GraphInputNode Source Handles (Max 1 Connection) ---
            if (sourceNode.type === 'graphInput') {
                // Check if this handle already has an outgoing connection
                const existingConnection = edges.find(e => 
                    e.source === params.source && 
                    e.sourceHandle === params.sourceHandle
                );
                
                if (existingConnection) {
                    // Option A: Prevent connection
                    // return; 
                    
                    // Option B: Replace connection (Remove old one)
                    setEdges((eds) => eds.filter(e => e.id !== existingConnection.id));
                }
            }

            // --- DYNAMIC PORT CREATION LOGIC ---
            if (currentScope !== 'root') {
                // 1. Create Input
                if (sourceNode.id === `input-proxy-${currentScope}` && params.sourceHandle === '__create_input__') {
                    const parentNode = reactFlowInstance?.getNode(currentScope);
                    if (parentNode) {
                        const targetInput = targetNode.data.inputs.find(i => i.id === params.targetHandle);
                        const newType = targetInput ? targetInput.type : 'float';
                        const newId = `input_${Date.now()}`;
                        
                        // Helper to get default value for type
                        const getDefaultVal = (t: string) => {
                            if (t === 'vec2') return [0,0];
                            if (t === 'vec3') return [0,0,0];
                            if (t === 'vec4') return [0,0,0,1];
                            return 0;
                        };

                        setNodes(nds => nds.map(n => {
                            if (n.id === currentScope) {
                                const newInputs = [...n.data.inputs, { id: newId, name: `${t('Input')} ${n.data.inputs.length + 1}`, type: newType }];
                                const newUniforms = { ...n.data.uniforms, [newId]: { type: newType, value: getDefaultVal(newType) } };
                                return { ...n, data: { ...n.data, inputs: newInputs, uniforms: newUniforms } };
                            }
                            if (n.id === sourceNode.id) {
                                return { ...n, data: { ...n.data, inputs: [...n.data.inputs, { id: newId, name: `${t('Input')} ${n.data.inputs.length + 1}`, type: newType }] } };
                            }
                            return n;
                        }));

                        setTimeout(() => {
                             setEdges((eds) => addEdge({ ...params, sourceHandle: newId, type: 'smart', animated: false }, eds));
                        }, 0);
                        return;
                    }
                }

                // 2. Create Output
                if (targetNode.id === `output-proxy-${currentScope}` && params.targetHandle === '__create_output__') {
                    const parentNode = reactFlowInstance?.getNode(currentScope);
                    if (parentNode) {
                        const sourceOutput = sourceNode.data.outputs?.find(o => o.id === params.sourceHandle);
                        const newType = sourceOutput ? sourceOutput.type : sourceNode.data.outputType;
                        const newId = `output_${Date.now()}`;

                        setNodes(nds => nds.map(n => {
                            if (n.id === currentScope) {
                                return { ...n, data: { ...n.data, outputs: [...(n.data.outputs || []), { id: newId, name: `${t('Output')} ${(n.data.outputs?.length || 0) + 1}`, type: newType }] } };
                            }
                            if (n.id === targetNode.id) {
                                return { ...n, data: { ...n.data, outputs: [...(n.data.outputs || []), { id: newId, name: `${t('Output')} ${(n.data.outputs?.length || 0) + 1}`, type: newType }] } };
                            }
                            return n;
                        }));

                        setTimeout(() => {
                             setEdges((eds) => addEdge({ ...params, targetHandle: newId, type: 'smart', animated: false }, eds));
                        }, 0);
                        return;
                    }
                }
            }
            
            setEdges((eds) => {
                const filtered = eds.filter(e => !(e.target === params.target && e.targetHandle === params.targetHandle));
                // Use 'smart' edge type and NO animation
                return addEdge({ ...params, type: 'smart', animated: false }, filtered);
            });
        },
        [setEdges, currentScope, setNodes, reactFlowInstance]
    );

    const addNode = useCallback((def: ShaderNodeDefinition, position?: { x: number, y: number }, initialValues?: Record<string, UniformVal>) => {
        // Use a more robust ID generation to avoid collisions during rapid creation or merges
        const id = `${def.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        let type = 'customShader';
        if (def.category === 'Network') type = 'networkNode';
        if (def.id === 'PAINT') type = 'paintNode'; 
        if (def.id === 'FLUID_SIM') type = 'fluidSimulationNode';
        if (def.id === 'PARTICLE_SYSTEM') type = 'particleSystem';
      //  if (def.id === 'FLOW_MAP') type = 'flowMapNode';
        if ((def as any).type === 'bakeNode') type = 'bakeNode';
    
        const baseUniforms: Record<string, UniformVal> = {
            ...(def.data.uniforms || {}),
            ...(initialValues || {})
        };

        const getDefaultUniformForType = (type: string): any => {
            switch (type) {
                case 'float': return 0;
                case 'int': return 0;
                case 'uint': return 0;
                case 'bool': return false;
                case 'vec2': return [0, 0];
                case 'vec3': return [0, 0, 0];
                case 'vec4': return [0, 0, 0, 1];
                case 'uvec2': return [0, 0];
                case 'uvec3': return [0, 0, 0];
                case 'uvec4': return [0, 0, 0, 0];
                case 'mat2': return [1, 0, 0, 1];
                case 'mat3': return [1, 0, 0, 0, 1, 0, 0, 0, 1];
                case 'mat4': return [
                    1, 0, 0, 0,
                    0, 1, 0, 0,
                    0, 0, 1, 0,
                    0, 0, 0, 1
                ];
                case 'sampler2D': return null;
                case 'samplerCube': return null;
                case 'vec2[]': return Array.from({ length: 16 }, () => [0, 0]);
                default: return 0;
            }
        };

        const ensureUniformDefaultsForInputs = (inputs: any[] | undefined, uniforms: Record<string, UniformVal>) => {
            if (!Array.isArray(inputs)) return uniforms;
            const next = { ...uniforms };
            for (const input of inputs) {
                const id = input?.id;
                const type = input?.type;
                if (!id || !type) continue;
                if (next[id] !== undefined) continue;

                const defVal = (input as any).default;
                next[id] = {
                    type,
                    value: defVal !== undefined ? defVal : getDefaultUniformForType(type)
                };
            }
            return next;
        };

        const filledUniforms = ensureUniformDefaultsForInputs((def.data as any).inputs, baseUniforms);

        const newNode: Node<NodeData> = {
          id,
          type,
          position: position || { x: Math.random() * 400 + 100, y: Math.random() * 400 + 100 },
          zIndex: 10,
          data: { 
            ...JSON.parse(JSON.stringify(def.data)), 
            label: def.label, 
            category: def.category,
                        description: def.description,
            definitionId: def.id,
            locales: def.locales,
            preview: false,
            resolution,
            uniforms: filledUniforms,
            scopeId: currentScope
          } as NodeData,
        };

        const nodesToAdd = [newNode];
        const edgesToAdd: Edge[] = [];

        // Handle Compound Node Import
        if (def.data.isCompound && def.data.internalNodes && Array.isArray(def.data.internalNodes)) {
            const idMap: Record<string, string> = {};
            
            // 1. Map IDs and Create Nodes
            def.data.internalNodes.forEach((n: SerializedNode) => {
                const newId = `${n.id}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                idMap[n.id] = newId;
                
                nodesToAdd.push({
                    ...n,
                    id: newId,
                    data: {
                        ...n.data,
                        scopeId: id // Set scope to the new Group Node ID
                    },
                    selected: false
                });
            });

            // 2. Create Edges
            if (def.data.internalEdges && Array.isArray(def.data.internalEdges)) {
                def.data.internalEdges.forEach((e: SerializedEdge) => {
                    const source = idMap[e.source];
                    const target = idMap[e.target];
                    
                    if (source && target) {
                        edgesToAdd.push({
                            ...e,
                            id: `e_${source}_${target}_${Date.now()}`,
                            source,
                            target
                        });
                    }
                });
            }
        }

        setNodes((nds) => nds.concat(nodesToAdd));
        if (edgesToAdd.length > 0) {
             setEdges((eds) => eds.concat(edgesToAdd));
        }
    }, [setNodes, setEdges, resolution, currentScope]);

    const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
        const target = event.target as HTMLElement;
        if (node.type === 'customShader' && target.closest('.preview-trigger')) {
            setPreviewNodeId(node.id);
        }
    }, [setPreviewNodeId]);

    const onNodeDragStart: NodeMouseHandler = useCallback(() => {
        setIsDragging(true);
    }, [setIsDragging]);

    // Handle Node Drag Stop (Parenting Logic)
    const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
        setIsDragging(false);
        setNodes((currentNodes) => {
            // 1. Find potential parent (Group Node) that intersects with the dragged node
            const nW = node.width ?? 150;
            const nH = node.height ?? 40;
            const nodeCenterX = (node.positionAbsolute?.x ?? node.position.x) + nW / 2;
            const nodeCenterY = (node.positionAbsolute?.y ?? node.position.y) + nH / 2;
  
            let newParentId: string | undefined = undefined;
  
            // Iterate through all nodes to find a group that contains this point
            for (let i = currentNodes.length - 1; i >= 0; i--) {
                const potentialParent = currentNodes[i];
                
                if (potentialParent.id === node.id || potentialParent.type !== 'group' || potentialParent.parentId) continue;
                
                const pX = potentialParent.positionAbsolute?.x ?? potentialParent.position.x;
                const pY = potentialParent.positionAbsolute?.y ?? potentialParent.position.y;
                const pW = potentialParent.width ?? 500; 
                const pH = potentialParent.height ?? 500; 
  
                if (nodeCenterX >= pX && nodeCenterX <= pX + pW &&
                    nodeCenterY >= pY && nodeCenterY <= pY + pH) {
                    newParentId = potentialParent.id;
                    break; 
                }
            }
  
            // 2. Check if parent changed
            if (node.parentId !== newParentId) {
                return currentNodes.map((n) => {
                    if (n.id === node.id) {
                        let newPos = { ...n.position };
                        
                        if (newParentId) {
                            const parentNode = currentNodes.find(p => p.id === newParentId);
                            if (parentNode) {
                                const parentAbsX = parentNode.positionAbsolute?.x ?? parentNode.position.x;
                                const parentAbsY = parentNode.positionAbsolute?.y ?? parentNode.position.y;
                                const nodeAbsX = n.positionAbsolute?.x ?? n.position.x;
                                const nodeAbsY = n.positionAbsolute?.y ?? n.position.y;
  
                                newPos = {
                                    x: nodeAbsX - parentAbsX,
                                    y: nodeAbsY - parentAbsY
                                };
                            }
                        } else {
                            if (n.positionAbsolute) {
                                newPos = { x: n.positionAbsolute.x, y: n.positionAbsolute.y };
                            }
                        }
  
                        return {
                            ...n,
                            parentId: newParentId,
                            position: newPos,
                            extent: undefined, 
                        };
                    }
                    return n;
                });
            }
            return currentNodes;
        });
    }, [setNodes]);

    const onNodesDelete = useCallback((deleted: Node[]) => {
        if (previewNodeId && deleted.some(n => n.id === previewNodeId)) {
            setPreviewNodeId(null);
            setCompiledData(null);
        }
    }, [previewNodeId, setPreviewNodeId, setCompiledData]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();

            if (!reactFlowWrapper.current || !reactFlowInstance) return;

            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            // 1. Handle File Drops (Image OR JSON)
            if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
                const file = event.dataTransfer.files[0];
                
                // Handle Images
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const result = e.target?.result;
                        const imageDef = getNodeDefinition('SAMP_TEXTURE');
                        if (imageDef && result) {
                            addNode(imageDef, position, { image: { type: 'sampler2D', value: result } });
                        }
                    };
                    reader.readAsDataURL(file);
                }
                // Handle JSON Node Definitions
                else if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.nodefx')) {
                     const reader = new FileReader();
                     reader.onload = (e) => {
                         try {
                             const json = JSON.parse(e.target?.result as string);
                             const normalized = normalizeNodeDefinition(json);
                             if (validateNodeDefinition(normalized)) {
                                 addNode(normalized, position);
                             } else {
                                 alert(t("Invalid Node JSON structure."));
                             }
                         } catch (err) {
                             console.error("JSON Parse Error:", err);
                             alert(t("Failed to parse JSON file."));
                         }
                     };
                     reader.readAsText(file);
                }
                return;
            }

            // 2. Handle ReactFlow Internal Drag
            const typeId = event.dataTransfer.getData('application/reactflow');
            if (typeId) {
                const def = fullRegistry[typeId];
                if (def) {
                    addNode(def, position);
                }
            }
        },
        [reactFlowInstance, addNode, fullRegistry, reactFlowWrapper, t]
    );

    return {
        onNodesChange,
        onConnect,
        addNode,
        onNodeClick,
        onNodeDragStart,
        onNodeDragStop,
        onNodesDelete,
        onDragOver,
        onDrop
    };
}
