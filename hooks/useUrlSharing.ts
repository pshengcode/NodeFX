import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import LZString from 'lz-string';

export const loadFlowFromUrl = () => {
    try {
        const hash = window.location.hash;
        if (hash.startsWith('#data=')) {
            const compressed = hash.substring(6);
            const json = LZString.decompressFromEncodedURIComponent(compressed);
            if (json) {
                const flow = JSON.parse(json);
                if (flow.nodes && flow.edges) {
                    return flow;
                }
            }
        }
    } catch (e) {
        console.error("Failed to parse URL hash", e);
    }
    return null;
};

export function useUrlSharing() {
    const copyShareLink = useCallback(async (nodes: Node[], edges: Edge[], previewNodeId: string | null) => {
        try {
            const flow = { nodes, edges, previewNodeId };
            const json = JSON.stringify(flow);
            const compressed = LZString.compressToEncodedURIComponent(json);
            const url = `${window.location.origin}${window.location.pathname}#data=${compressed}`;
            
            await navigator.clipboard.writeText(url);
            return url;
        } catch (e) {
            console.error("Failed to copy share link", e);
            return null;
        }
    }, []);

    return { copyShareLink };
}
