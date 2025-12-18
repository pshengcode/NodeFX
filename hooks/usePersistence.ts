import { useState, useEffect, useCallback, useRef } from 'react';
import { Node, Edge } from 'reactflow';

const STORAGE_KEY = 'glsl-app-flow';

export function usePersistence(
    nodes: Node[], 
    edges: Edge[], 
    previewNodeId: string | null,
    isDragging: boolean,
    setNodes: (nodes: Node[]) => void, 
    setEdges: (edges: Edge[]) => void,
    initialNodes: Node[],
    initialEdges: Edge[]
) {
    const [isLoaded, setIsLoaded] = useState(false);
    
    // Keep track of latest state for synchronous save on unload
    const stateRef = useRef({ nodes, edges, previewNodeId, isLoaded });
    useEffect(() => {
        stateRef.current = { nodes, edges, previewNodeId, isLoaded };
    }, [nodes, edges, previewNodeId, isLoaded]);

    // App.tsx handles initial load via useMemo, so we just mark as loaded
    useEffect(() => {
        setIsLoaded(true);
    }, []);

    // Save on unload (Refresh/Close)
    useEffect(() => {
        const handleUnload = () => {
            if (!stateRef.current.isLoaded) return;
            try {
                const { nodes, edges, previewNodeId } = stateRef.current;
                const flow = { nodes, edges, previewNodeId };
                const json = JSON.stringify(flow);
                localStorage.setItem(STORAGE_KEY, json);
            } catch (err) {
                console.error("Failed to save project on unload:", err);
            }
        };
        window.addEventListener('beforeunload', handleUnload);
        return () => window.removeEventListener('beforeunload', handleUnload);
    }, []);

    // Auto-save with debounce
    useEffect(() => {
        if (!isLoaded) return; // Don't save before loading
        if (isDragging) return; // Skip autosave during drag for performance

        const saveTimeout = setTimeout(() => {
            try {
                const flow = { nodes, edges, previewNodeId };
                const json = JSON.stringify(flow);
                localStorage.setItem(STORAGE_KEY, json);
            } catch (err) {
                console.error("Failed to save project to localStorage:", err);
                // Optional: Notify user if quota exceeded
            }
        }, 500); // Reduced to 500ms

        return () => clearTimeout(saveTimeout);
    }, [nodes, edges, previewNodeId, isLoaded, isDragging]);

    const clearPersistence = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return { clearPersistence, isLoaded };
}
