import { useMemo } from 'react';
import { ShaderNodeDefinition } from '../types';
import { NODE_REGISTRY } from '../nodes/registry';

export function useExternalNodes() {
  // In the new architecture, all nodes are loaded via import.meta.glob in registry.ts.
  // This hook is kept for compatibility and to provide the categorized view.
  
  const fullRegistry = NODE_REGISTRY;

  const nodesByCategory = useMemo(() => {
    const groups: Record<string, ShaderNodeDefinition[]> = {};
    fullRegistry.forEach(node => {
      if (!groups[node.category]) groups[node.category] = [];
      groups[node.category].push(node);
    });
    return groups;
  }, [fullRegistry]);

  return {
    externalNodes: [] as ShaderNodeDefinition[], // No longer used separately
    isRefreshingNodes: false,
    refreshExternalNodes: async () => {}, // No-op
    fullRegistry,
    nodesByCategory
  };
}
