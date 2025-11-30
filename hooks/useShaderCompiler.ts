import { useEffect, useRef } from 'react';
import { Node, Edge } from 'reactflow';
import { NodeData, CompilationResult } from '../types';
import { compileGraph } from '../utils/shaderCompiler';

export function useShaderCompiler(
    nodes: Node<NodeData>[],
    edges: Edge[],
    previewNodeId: string | null,
    setCompiledData: (data: CompilationResult | null) => void
) {
    // OPTIMIZATION: Run compilation on Main Thread to avoid Worker serialization overhead
    // for frequent updates (like dragging sliders).
    // For very complex shaders, this might block UI, but for typical usage, 
    // the serialization cost of Worker is higher than the compilation cost.
    
    useEffect(() => {
        if (!previewNodeId || nodes.length === 0) {
            setCompiledData(null);
            return;
        }

        try {
            const result = compileGraph(nodes, edges, previewNodeId);
            setCompiledData(result);
        } catch (err) {
            console.error("Shader Compile Error:", err);
            setCompiledData({ passes: [], error: err instanceof Error ? err.message : String(err) });
        }
    }, [nodes, edges, previewNodeId]);
}

