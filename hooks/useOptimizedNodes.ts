import { useMemo } from 'react';
import { useStore } from 'reactflow';

// Selector to get nodes data without positions (prevents re-render on drag)
const nodesSelector = (state: any) => state.nodeInternals;

// Deep compare for selector
const deepEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

const nodesEqual = (a: Map<string, any>, b: Map<string, any>) => {
    if (a === b) return true;
    if (a.size !== b.size) return false;
    for (const [id, nodeA] of a) {
        const nodeB = b.get(id);
        if (!nodeB) return false;
        if (nodeA.type !== nodeB.type) return false;
        if (nodeA.data !== nodeB.data && !deepEqual(nodeA.data, nodeB.data)) return false;
    }
    return true;
};

/**
 * A custom hook that returns nodes from the ReactFlow store,
 * but optimized to NOT trigger re-renders when nodes are merely dragged (position changes).
 * It only updates when node structure (id, type) or data changes.
 */
export const useOptimizedNodes = () => {
    const nodeInternals = useStore(nodesSelector, nodesEqual);
    
    const nodes = useMemo(() => Array.from(nodeInternals.values()).map((n: any) => ({
        id: n.id,
        type: n.type,
        data: n.data
    })), [nodeInternals]);

    return nodes;
};
