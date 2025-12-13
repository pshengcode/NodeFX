import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { NodeData } from '../types';

/**
 * Calculates the absolute position of a node in the flow, accounting for nested groups.
 * @param nodeId The ID of the node to find the position for.
 * @param nodes The list of all nodes in the flow.
 * @returns The absolute {x, y} position.
 */
export const getAbsolutePosition = (nodeId: string, nodes: Node<NodeData>[]): { x: number, y: number } => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };
    
    let x = node.position.x;
    let y = node.position.y;
    
    if (node.parentId) {
        const parentPos = getAbsolutePosition(node.parentId, nodes);
        x += parentPos.x;
        y += parentPos.y;
    }
    
    return { x, y };
};

/**
 * Clones a list of nodes and edges, generating new IDs and cleaning up data.
 * @param nodesToClone The nodes to clone.
 * @param edgesToClone The edges to clone.
 * @param resolution Current canvas resolution.
 * @param currentScope Current scope ID (or 'root').
 * @param positionOffset Optional function to calculate new position for each node.
 * @returns Object containing new nodes and edges.
 */
export const cloneNodesAndEdges = (
    nodesToClone: Node<NodeData>[],
    edgesToClone: Edge[],
    resolution: { w: number, h: number },
    currentScope: string,
    positionOffset?: (node: Node<NodeData>, minX: number, minY: number, effectivePos: { x: number, y: number }) => { x: number, y: number },
    allNodes?: Node<NodeData>[]
) => {
    const idMap = new Map<string, string>();

    const clonedIdSet = new Set(nodesToClone.map(n => n.id));

    const getEffectivePosition = (node: Node<NodeData>): { x: number, y: number } => {
        // If a node is inside a group but we are NOT cloning its parent group,
        // we need its absolute position because the clone will become top-level.
        if (node.parentId && !clonedIdSet.has(node.parentId) && allNodes) {
            return getAbsolutePosition(node.id, allNodes);
        }
        return node.position;
    };
    
    // Calculate bounding box for relative positioning
    let minX = Infinity, minY = Infinity;
    nodesToClone.forEach(n => {
        const p = getEffectivePosition(n);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
    });

    const newNodes = nodesToClone.map((node, index) => {
        const id = `${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;
        idMap.set(node.id, id);

        const newData = JSON.parse(JSON.stringify(node.data));
        if (newData.preview) newData.preview = false;
        newData.resolution = resolution;
        if (newData.executionError) delete newData.executionError;
        
        // Update scopeId
        newData.scopeId = currentScope === 'root' ? undefined : currentScope;

        if (node.type === 'networkNode') {
            delete newData.customId;
        }

        const effectivePos = getEffectivePosition(node);

        // Calculate Position
        let newPos = { x: effectivePos.x + 50, y: effectivePos.y + 50 }; // Default offset
        if (positionOffset) {
            newPos = positionOffset(node, minX, minY, effectivePos);
        }

        return {
            ...node,
            id,
            type: node.type,
            position: newPos,
            data: newData,
            selected: true,
            zIndex: node.type === 'group' ? -10 : 10,
            parentId: node.parentId 
        };
    });

    // Fix parentIds
    const finalNodes = newNodes.map(n => {
        // Case 1: Parent was also cloned
        if (n.parentId && idMap.has(n.parentId)) {
            return { ...n, parentId: idMap.get(n.parentId) };
        }
        
        // Case 2: Parent was NOT cloned
        // We do NOT assign parentId to currentScope, because currentScope is a logical scope (filtering),
        // not necessarily a visual container (parentId).
        // Nodes in a scope are usually flat (parentId: undefined) but have data.scopeId set.
        return { ...n, parentId: undefined };
    });

    const newEdges = edgesToClone.map(edge => ({
        ...edge,
        id: `e_${idMap.get(edge.source)}-${idMap.get(edge.target)}_${Math.random().toString(36).substr(2, 5)}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
        selected: false,
        animated: false
    }));

    return { nodes: finalNodes, edges: newEdges };
};
