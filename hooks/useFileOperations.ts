import React, { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { normalizeNodeDefinition, validateNodeDefinition } from '../nodes/registry';
import { NodeData, ShaderNodeDefinition } from '../types';
import { useTranslation } from 'react-i18next';

export function useFileOperations(
    nodes: Node<NodeData>[],
    edges: Edge[],
    setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>,
    setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
    setPreviewNodeId: (id: string | null) => void,
    resolution: { w: number, h: number },
    addNode: (def: ShaderNodeDefinition, pos?: { x: number, y: number }, val?: any) => void,
    clearPersistence: () => void,
    initialNodes: Node<NodeData>[],
    initialEdges: Edge[],
    projectFileInputRef: React.RefObject<HTMLInputElement>,
    nodeImportInputRef: React.RefObject<HTMLInputElement>
) {
    const { t } = useTranslation();

    const saveProject = useCallback(() => {
        const project = { nodes, edges };
        const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'glsl-project.nodefxs';
        link.click();
        URL.revokeObjectURL(url);
    }, [nodes, edges]);
  
    const loadProject = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const project = JSON.parse(event.target?.result as string);
                if (project.nodes && project.edges) {
                    const nodesWithZ = project.nodes.map((n: Node) => ({
                        ...n,
                        zIndex: n.type === 'group' ? -10 : 10,
                        data: { ...n.data, resolution } 
                    }));
                    setNodes(nodesWithZ);
                    setEdges(project.edges);
                    
                    // Restore preview state
                    let previewNode = nodesWithZ.find((n: Node) => n.data.preview);
                    
                    // Fallback: If no preview set, try '1' or first node
                    if (!previewNode && nodesWithZ.length > 0) {
                        previewNode = nodesWithZ.find((n: Node) => n.id === '1') || nodesWithZ[0];
                    }
                    
                    setPreviewNodeId(previewNode ? previewNode.id : null); 
                }
            } catch (err) {
                alert(t("Invalid Project File"));
            }
        };
        reader.readAsText(file);
        if (projectFileInputRef.current) projectFileInputRef.current.value = '';
    }, [resolution, setNodes, setEdges, setPreviewNodeId, projectFileInputRef, t]);
  
    const importNodeFromJson = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                const normalized = normalizeNodeDefinition(json);
                if(validateNodeDefinition(normalized)) {
                    addNode(normalized);
                } else {
                    alert(t("Invalid Node JSON"));
                }
            } catch (err) {
                alert(t("Failed to parse JSON."));
            }
        }
        reader.readAsText(file);
        if(nodeImportInputRef.current) nodeImportInputRef.current.value = '';
    }, [addNode, nodeImportInputRef, t]);
  
    const resetCanvas = useCallback(() => {
      if (window.confirm(t("Are you sure you want to reset the canvas? All unsaved changes will be lost."))) {
        setNodes(initialNodes);
        setEdges(initialEdges);
        setPreviewNodeId('1');
        clearPersistence();
      }
    }, [setNodes, setEdges, setPreviewNodeId, clearPersistence, initialNodes, initialEdges, t]);

    const loadExampleProject = useCallback(async () => {
        try {
            const response = await fetch('/example.nodefxs');
            if (!response.ok) {
                console.warn("Example project not found");
                return false;
            }
            const project = await response.json();
            if (project.nodes && project.edges) {
                const nodesWithZ = project.nodes.map((n: Node) => ({
                    ...n,
                    zIndex: n.type === 'group' ? -10 : 10,
                    data: { ...n.data, resolution } 
                }));
                setNodes(nodesWithZ);
                setEdges(project.edges);
                
                // Restore preview state
                let previewNode = nodesWithZ.find((n: Node) => n.data.preview);
                
                // Fallback: If no preview set, try '1' or first node
                if (!previewNode && nodesWithZ.length > 0) {
                    previewNode = nodesWithZ.find((n: Node) => n.id === '1') || nodesWithZ[0];
                }

                setPreviewNodeId(previewNode ? previewNode.id : null);
                return true;
            }
        } catch (err) {
            console.error("Failed to load example project", err);
        }
        return false;
    }, [resolution, setNodes, setEdges, setPreviewNodeId]);

    return {
        saveProject,
        loadProject,
        importNodeFromJson,
        resetCanvas,
        loadExampleProject
    };
}
