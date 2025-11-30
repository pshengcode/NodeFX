import { useState, useEffect, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

const STORAGE_KEY = 'glsl-app-flow';

export function usePersistence(
    nodes: Node[], 
    edges: Edge[], 
    previewNodeId: string | null,
    setNodes: (nodes: Node[]) => void, 
    setEdges: (edges: Edge[]) => void,
    initialNodes: Node[],
    initialEdges: Edge[]
) {
    const [isLoaded, setIsLoaded] = useState(false);

    // App.tsx handles initial load via useMemo, so we just mark as loaded
    useEffect(() => {
        setIsLoaded(true);
    }, []);

    // Auto-save with debounce
    useEffect(() => {
        if (!isLoaded) return; // Don't save before loading

        const saveTimeout = setTimeout(() => {
            try {
                const flow = { nodes, edges, previewNodeId };
                const json = JSON.stringify(flow);
                localStorage.setItem(STORAGE_KEY, json);
            } catch (err) {
                console.error("Failed to save project to localStorage:", err);
                // Optional: Notify user if quota exceeded
            }
        }, 1000);

        return () => clearTimeout(saveTimeout);
    }, [nodes, edges, previewNodeId, isLoaded]);

    const clearPersistence = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return { clearPersistence, isLoaded };
}
