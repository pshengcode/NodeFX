import React, { useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { NodeData } from '../types';
import { useTranslation } from 'react-i18next';

export function useKeyboardShortcuts(
    nodes: Node<NodeData>[],
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    edges: Edge[],
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    resolution: { w: number, h: number },
    undo: () => void,
    redo: () => void
) {
    const { t } = useTranslation();

    useEffect(() => {
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
                        data: { label: t('Group'), description: '' },
                        selected: true,
                        zIndex: -10, 
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
  
            if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                
                const selectedNodes = nodes.filter(n => n.selected);
                if (selectedNodes.length === 0) return;

                // Map to store Old ID -> New ID
                const idMap = new Map<string, string>();

                const newNodes = selectedNodes.map((node, index) => {
                    const id = `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
                    idMap.set(node.id, id);

                    const newData = JSON.parse(JSON.stringify(node.data));
                    if (newData.preview) newData.preview = false;
                    newData.resolution = resolution;
                    if (newData.executionError) delete newData.executionError;
                    
                    // Fix: If duplicating a Network Node, remove the ID so it regenerates a random one
                    if (node.type === 'networkNode') {
                        delete newData.customId;
                    }

                    return {
                        ...node,
                        id,
                        type: node.type,
                        position: { x: node.position.x + 50, y: node.position.y + 50 },
                        data: newData,
                        selected: true,
                        zIndex: node.type === 'group' ? -10 : 10,
                        parentId: node.parentId
                    };
                });

                setNodes((currentNodes) => 
                    currentNodes.map(n => ({...n, selected: false})).concat(newNodes)
                );

                // Duplicate Edges between selected nodes
                const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
                const internalEdges = edges.filter(e => 
                    selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
                );

                if (internalEdges.length > 0) {
                    const newEdges = internalEdges.map(edge => ({
                        ...edge,
                        id: `e_${idMap.get(edge.source)}-${idMap.get(edge.target)}_${Math.random().toString(36).substr(2, 5)}`,
                        source: idMap.get(edge.source)!,
                        target: idMap.get(edge.target)!,
                        selected: false,
                        animated: false // Reset animation if any
                    }));
                    
                    setEdges((currentEdges) => [...currentEdges, ...newEdges]);
                }
            }
        };
  
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, setNodes, resolution]);

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
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
