import React, { createContext, useContext } from 'react';
import { Node } from 'reactflow';
import { NodeData } from '../types';

// Separate context for nodes data that changes frequently
const NodesContext = createContext<Node<NodeData>[]>([]);

export const NodesProvider: React.FC<{ nodes: Node<NodeData>[]; children: React.ReactNode }> = ({ nodes, children }) => {
    return <NodesContext.Provider value={nodes}>{children}</NodesContext.Provider>;
};

export const useNodes = () => {
    return useContext(NodesContext);
};

// Selector hook to get a specific node by ID
export const useNode = (nodeId: string): Node<NodeData> | undefined => {
    const nodes = useNodes();
    return React.useMemo(() => nodes.find(n => n.id === nodeId), [nodes, nodeId]);
};

// Selector hook to get node data by ID
export const useNodeData = (nodeId: string): NodeData | undefined => {
    const node = useNode(nodeId);
    return node?.data;
};

// Selector hook to check if a node is preview
export const useIsPreviewNode = (nodeId: string): boolean => {
    const node = useNode(nodeId);
    return node?.data.preview ?? false;
};
