import { useState, useEffect, useCallback } from 'react';
import { ShaderNodeDefinition, NodeData, LibraryItem, CanvasTemplate, SerializedNode, SerializedEdge } from '../types';
import { Node, Edge } from 'reactflow';

const STORAGE_KEY = 'nodefx_user_library';

export const useUserLibrary = () => {
    const [userNodes, setUserNodes] = useState<LibraryItem[]>([]);

    // Load from LocalStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    setUserNodes(parsed);
                }
            }
        } catch (e) {
            console.error("Failed to load user library:", e);
        }
    }, []);

    // Save to LocalStorage whenever userNodes changes
    const saveToStorage = useCallback((items: LibraryItem[]) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
        } catch (e) {
            console.error("Failed to save user library:", e);
        }
    }, []);

    const addToLibrary = useCallback((nodeData: NodeData) => {
        const isMultiPass = Array.isArray((nodeData as any).passes) && (nodeData as any).passes.length > 0;

        const def: ShaderNodeDefinition = {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            label: nodeData.label,
            category: 'User',
            description: nodeData.description || 'User saved node',
            locales: nodeData.locales,
            data: {
                // IMPORTANT: For multi-pass nodes, omit `glsl` to ensure schema union matches the multi-pass branch.
                // Otherwise Zod may parse as single-pass and strip `passes`, causing data loss on load/validate.
                ...(isMultiPass ? {} : { glsl: nodeData.glsl }),
                inputs: nodeData.inputs,
                outputs: nodeData.outputs,
                uniforms: nodeData.uniforms,
                outputType: nodeData.outputType,
                autoType: nodeData.autoType,
                isCompound: nodeData.isCompound,
                ...(isMultiPass ? { passes: (nodeData as any).passes } : {}),
                internalNodes: nodeData.isCompound ? nodeData.internalNodes : undefined,
                internalEdges: nodeData.isCompound ? nodeData.internalEdges : undefined
            }
        };

        setUserNodes(prev => {
            const next = [...prev, def];
            saveToStorage(next);
            return next;
        });
    }, [saveToStorage]);

    // Add canvas template to library
    const addCanvasToLibrary = useCallback((
        label: string,
        nodes: Node<NodeData>[],
        edges: Edge[],
        previewNodeId: string | null,
        description?: string
    ) => {
        const readDim = (v: any): number | undefined => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string') {
                const parsed = Number.parseFloat(v);
                return Number.isFinite(parsed) ? parsed : undefined;
            }
            return undefined;
        };

        const serializedNodes: SerializedNode[] = nodes.map(node => ({
            id: node.id,
            type: node.type || 'custom',
            position: node.position,
            data: node.data,
            parentId: node.parentId,
            extent: node.extent === 'parent' ? 'parent' : undefined,
            width: (
                (typeof node.width === 'number' && Number.isFinite(node.width) ? node.width : undefined) ??
                readDim((node.style as any)?.width) ??
                null
            ),
            height: (
                (typeof node.height === 'number' && Number.isFinite(node.height) ? node.height : undefined) ??
                readDim((node.style as any)?.height) ??
                null
            )
        }));

        const serializedEdges: SerializedEdge[] = edges.map(edge => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            // Persist handles explicitly so JSON round-trips consistently.
            // (undefined would be dropped, which can break compileGraph traversal on restore)
            sourceHandle: edge.sourceHandle ?? null,
            targetHandle: edge.targetHandle ?? null,
            type: edge.type,
            animated: edge.animated,
            data: edge.data
        }));

        const template: CanvasTemplate = {
            id: `canvas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            label,
            description: description || 'Saved canvas template',
            category: 'User',
            itemType: 'canvas',
            timestamp: Date.now(),
            nodes: serializedNodes,
            edges: serializedEdges,
            previewNodeId
        };

        setUserNodes(prev => {
            const next = [...prev, template];
            saveToStorage(next);
            return next;
        });
    }, [saveToStorage]);

    const removeFromLibrary = useCallback((id: string) => {
        setUserNodes(prev => {
            const next = prev.filter(n => n.id !== id);
            saveToStorage(next);
            return next;
        });
    }, [saveToStorage]);

    const importLibrary = useCallback((json: string) => {
        try {
            const imported = JSON.parse(json);
            if (Array.isArray(imported)) {
                // Validate basic structure if needed
                setUserNodes(prev => {
                    // Merge strategy: Append new ones. 
                    // Could also check for duplicates by ID or Label, but simple append is safer for now.
                    const next = [...prev, ...imported];
                    saveToStorage(next);
                    return next;
                });
                return true;
            }
        } catch (e) {
            console.error("Import failed:", e);
        }
        return false;
    }, [saveToStorage]);

    const exportLibrary = useCallback(() => {
        const blob = new Blob([JSON.stringify(userNodes, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `nodefx_library_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }, [userNodes]);

    return {
        userNodes,
        addToLibrary,
        addCanvasToLibrary,
        removeFromLibrary,
        importLibrary,
        exportLibrary
    };
};
