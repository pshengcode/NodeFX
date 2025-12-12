import { useEffect, useRef, useState } from 'react';
import { Node, Edge } from 'reactflow';
import { NodeData, CompilationResult } from '../types';
import { compileGraph } from '../utils/shaderCompiler';

// Global compilation stats
let totalCompiles = 0;
let totalErrors = 0;
let lastCompileTime = 0;

export function useShaderCompiler(
    nodes: Node<NodeData>[],
    edges: Edge[],
    previewNodeId: string | null,
    setCompiledData: (data: CompilationResult | null) => void,
    isDragging: boolean
) {
    const [compileStats, setCompileStats] = useState({ totalCompiles, totalErrors, lastCompileTime });
    // OPTIMIZATION: Run compilation on Main Thread to avoid Worker serialization overhead
    // for frequent updates (like dragging sliders).
    // For very complex shaders, this might block UI, but for typical usage, 
    // the serialization cost of Worker is higher than the compilation cost.
    
    const prevHash = useRef<string>("");

    useEffect(() => {
        if (isDragging) return; // Skip compilation during drag

        if (!previewNodeId || nodes.length === 0) {
            setCompiledData(null);
            return;
        }

        // Simple structural hash to avoid recompiling on position changes
        // We include: node IDs, types, data (excluding position-related), and edges
        const structure = {
            nodes: nodes.map(n => ({
                id: n.id,
                type: n.type,
                // Only include data relevant to compilation
                data: {
                    ...n.data,
                    // Exclude UI state that doesn't affect shader
                    preview: undefined,
                    label: undefined,
                    // Include glsl, inputs, outputs, uniforms, etc.
                }
            })),
            edges: edges.map(e => ({ s: e.source, t: e.target, sh: e.sourceHandle, th: e.targetHandle })),
            previewNodeId
        };
        
        const currentHash = JSON.stringify(structure);
        if (currentHash === prevHash.current) return;
        prevHash.current = currentHash;

        const startTime = performance.now();
        try {
            const result = compileGraph(nodes, edges, previewNodeId);
            lastCompileTime = performance.now() - startTime;
            totalCompiles++;
            setCompiledData(result);
            setCompileStats({ totalCompiles, totalErrors, lastCompileTime });
        } catch (err) {
            console.error("Shader Compile Error:", err);
            lastCompileTime = performance.now() - startTime;
            totalCompiles++;
            totalErrors++;
            setCompiledData({ passes: [], error: err instanceof Error ? err.message : String(err) });
            setCompileStats({ totalCompiles, totalErrors, lastCompileTime });
        }
    }, [nodes, edges, previewNodeId, isDragging, setCompiledData]);
    
    return compileStats;
}

