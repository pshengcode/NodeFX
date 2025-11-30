import { compileGraph } from './shaderCompiler';

self.onmessage = (e: MessageEvent) => {
    const { nodes, edges, targetNodeId } = e.data;
    try {
        const result = compileGraph(nodes, edges, targetNodeId);
        self.postMessage({ type: 'RESULT', payload: result });
    } catch (error) {
        // Ensure error is serializable
        const errorMessage = error instanceof Error ? error.message : String(error);
        self.postMessage({ type: 'ERROR', payload: errorMessage });
    }
};
