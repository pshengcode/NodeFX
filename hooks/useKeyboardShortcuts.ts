import React, { useEffect } from 'react';
import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { NodeData } from '../types';
import { useTranslation } from 'react-i18next';
import { getAbsolutePosition, cloneNodesAndEdges } from '../utils/graphUtils';

export function useKeyboardShortcuts(
    nodes: Node<NodeData>[],
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    edges: Edge[],
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    resolution: { w: number, h: number },
    undo: () => void,
    redo: () => void,
    currentScope: string,
    reactFlowInstance: ReactFlowInstance | null,
    isDragging: boolean
) {
    const { t } = useTranslation();

    // Clipboard state
    const [clipboard, setClipboard] = React.useState<{ nodes: Node<NodeData>[], edges: Edge[] } | null>(null);
    
    // Track mouse position
    const mousePosRef = React.useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            mousePosRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    useEffect(() => {
        if (isDragging) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            // UI/UX FIX: Check if we are in an input, textarea, contenteditable (like div inputs), or the Monaco Editor
            const isInput = 
                target instanceof HTMLInputElement || 
                target instanceof HTMLTextAreaElement || 
                target.isContentEditable || 
                target.closest('.monaco-editor');
  
            // If typing, ignore global shortcuts
            if (isInput) return;
  
            // Grouping (C key without Ctrl)
            if ((e.key === 'c' || e.key === 'C') && !e.repeat && !e.ctrlKey && !e.metaKey) {
                const selectedNodes = nodes.filter(n => n.selected && n.type !== 'group' && !n.parentId);
                if (selectedNodes.length > 0) {
                    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                    
                    selectedNodes.forEach(node => {
                        minX = Math.min(minX, node.position.x);
                        minY = Math.min(minY, node.position.y);
                        const w = node.width || 250; 
                        const h = node.height || 150;
                        maxX = Math.max(maxX, node.position.x + w);
                        maxY = Math.max(maxY, node.position.y + h);
                    });
  
                    const padding = 40;
                    const groupNode: Node = {
                        id: `group-${Date.now()}`,
                        type: 'group',
                        position: { x: minX - padding, y: minY - padding - 30 },
                        style: { width: (maxX - minX) + padding * 2, height: (maxY - minY) + padding * 2 + 30 },
                        data: { label: t('Group'), description: '', scopeId: currentScope === 'root' ? undefined : currentScope },
                        selected: true,
                        zIndex: -10, 
                        parentId: currentScope === 'root' ? undefined : currentScope
                    };
  
                    const updatedChildren = nodes.map(node => {
                        if (node.selected && node.type !== 'group' && !node.parentId) {
                            return {
                                ...node,
                                parentId: groupNode.id,
                                position: {
                                    x: node.position.x - groupNode.position.x,
                                    y: node.position.y - groupNode.position.y
                                },
                                selected: false,
                                zIndex: 10, 
                            };
                        }
                        return node;
                    });
  
                    setNodes([...updatedChildren, groupNode]);
                }
            }
  
            // Copy (Ctrl+C)
            if ((e.key === 'c' || e.key === 'C') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                const selectedNodes = nodes.filter(n => n.selected);
                
                // RESTRICTION: Prevent copying of GraphInput and GraphOutput nodes
                const copyableNodes = selectedNodes.filter(n => n.type !== 'graphInput' && n.type !== 'graphOutput');

                if (copyableNodes.length === 0) return;

                const selectedNodeIds = new Set(copyableNodes.map(n => n.id));
                const internalEdges = edges.filter(e => 
                    selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
                );

                setClipboard({
                    nodes: copyableNodes,
                    edges: internalEdges
                });
            }

            // Paste (Ctrl+V)
            if ((e.key === 'v' || e.key === 'V') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (!clipboard || clipboard.nodes.length === 0) return;

                let pasteX = 0;
                let pasteY = 0;
                let useMousePos = false;

                if (reactFlowInstance) {
                    // Convert screen coordinates to flow coordinates
                    const flowPos = reactFlowInstance.screenToFlowPosition({
                        x: mousePosRef.current.x,
                        y: mousePosRef.current.y
                    });
                    pasteX = flowPos.x;
                    pasteY = flowPos.y;

                    // NOTE: We do NOT subtract groupPos here anymore.
                    // Since we are not setting parentId to currentScope, the position should be absolute (World Space).
                    // React Flow handles the viewport transform via screenToFlowPosition.
                    
                    useMousePos = true;
                }

                const { nodes: finalNodes, edges: newEdges } = cloneNodesAndEdges(
                    clipboard.nodes,
                    clipboard.edges,
                    resolution,
                    currentScope,
                    (node, minX, minY, effectivePos) => {
                        if (useMousePos) {
                            const offsetX = effectivePos.x - minX;
                            const offsetY = effectivePos.y - minY;
                            return { x: pasteX + offsetX, y: pasteY + offsetY };
                        } else {
                            return { x: effectivePos.x + 50, y: effectivePos.y + 50 };
                        }
                    },
                    nodes
                );

                setNodes((currentNodes) => 
                    currentNodes.map(n => ({...n, selected: false})).concat(finalNodes)
                );

                if (newEdges.length > 0) {
                    setEdges((currentEdges) => [...currentEdges, ...newEdges]);
                }
            }
  
            // Duplicate (Ctrl+D)
            if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                
                const selectedNodes = nodes.filter(n => n.selected);
                
                // RESTRICTION: Prevent duplication of GraphInput and GraphOutput nodes
                const duplicatableNodes = selectedNodes.filter(n => n.type !== 'graphInput' && n.type !== 'graphOutput');

                if (duplicatableNodes.length === 0) return;

                const selectedNodeIds = new Set(duplicatableNodes.map(n => n.id));
                const internalEdges = edges.filter(e => 
                    selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
                );

                let dupX = 0;
                let dupY = 0;
                let useMousePos = false;

                if (reactFlowInstance) {
                    const flowPos = reactFlowInstance.screenToFlowPosition({
                        x: mousePosRef.current.x,
                        y: mousePosRef.current.y
                    });
                    // Small offset so the duplicate isn't exactly under the cursor.
                    dupX = flowPos.x + 20;
                    dupY = flowPos.y + 20;
                    useMousePos = true;
                }

                const { nodes: newNodes, edges: newEdges } = cloneNodesAndEdges(
                    duplicatableNodes,
                    internalEdges,
                    resolution,
                    currentScope,
                    (node, minX, minY, effectivePos) => {
                        if (useMousePos) {
                            const offsetX = effectivePos.x - minX;
                            const offsetY = effectivePos.y - minY;
                            return { x: dupX + offsetX, y: dupY + offsetY };
                        }
                        return { x: effectivePos.x + 50, y: effectivePos.y + 50 };
                    },
                    nodes
                );

                setNodes((currentNodes) => 
                    currentNodes.map(n => ({...n, selected: false})).concat(newNodes)
                );

                if (newEdges.length > 0) {
                    setEdges((currentEdges) => [...currentEdges, ...newEdges]);
                }
            }
        };
  
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, setNodes, resolution, clipboard, currentScope, reactFlowInstance, isDragging]); // Added dependencies

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
        if (isDragging) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                undo();
            }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
                e.preventDefault();
                redo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);
}
