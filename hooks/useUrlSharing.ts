import { useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import LZString from 'lz-string';

export type ShareLinkResult = {
    url: string;
    copied: boolean;
};

const fallbackCopyText = (text: string): boolean => {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        ta.style.pointerEvents = 'none';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
};

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
    const copyShareLink = useCallback(async (nodes: Node[], edges: Edge[], previewNodeId: string | null): Promise<ShareLinkResult | null> => {
        try {
            const flow = { nodes, edges, previewNodeId };
            const json = JSON.stringify(flow);
            const compressed = LZString.compressToEncodedURIComponent(json);
            const url = `${window.location.origin}${window.location.pathname}#data=${compressed}`;

            // Clipboard API can fail on non-secure origins or due to permissions.
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(url);
                    return { url, copied: true };
                }
            } catch {
                // fall through to legacy copy
            }

            const copied = fallbackCopyText(url);
            return { url, copied };
        } catch (e) {
            console.error("Failed to copy share link", e);
            return null;
        }
    }, []);

    return { copyShareLink };
}
