import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useReactFlow } from 'reactflow';
import { NodeData } from '../types';

// Helper for deep comparison
const isEqual = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A hook to synchronize local component state with React Flow node data.
 * Handles:
 * 1. Initialization from data.settings
 * 2. Upstream sync: Updates local state when data.settings changes (e.g. Undo/Redo)
 * 3. Downstream sync: Debounced updates to data.settings when local state changes
 * 
 * @param id Node ID
 * @param data Node Data
 * @param defaultSettings Default values for settings
 * @param debounceTime Time in ms to debounce updates to global store
 */
export function useNodeSettings<T extends Record<string, any>>(
  id: string,
  data: NodeData,
  defaultSettings: T,
  debounceTime = 500
) {
  const { setNodes } = useReactFlow();
  
  // Memoize defaultSettings to avoid unnecessary updates if the object reference changes but values don't
  const defaults = useMemo(() => defaultSettings, [JSON.stringify(defaultSettings)]);

  // 1. Initialize local state
  // We merge defaultSettings with data.settings to ensure all fields exist
  const [settings, setSettings] = useState<T>(() => ({
    ...defaults,
    ...(data.settings || {})
  }));

  // Track if the current update is coming from upstream (Undo/Redo)
  const isUpstreamUpdate = useRef(false);

  // 2. Sync from Upstream (Undo/Redo/External Changes)
  useEffect(() => {
    // Construct what the settings SHOULD be based on external data
    const incomingSettings = { 
        ...defaults, 
        ...(data.settings || {}) 
    } as T;

    setSettings(current => {
      // Only update if structurally different to avoid re-renders
      if (isEqual(current, incomingSettings)) return current;
      
      // Mark this update as coming from upstream
      isUpstreamUpdate.current = true;
      return incomingSettings;
    });
  }, [data.settings, defaults]);


  // 3. Sync to Downstream (Debounced update to React Flow)
  useEffect(() => {
    // If this effect was triggered by an upstream update, skip the downstream sync
    // to prevent "echo" updates (writing back what we just read).
    if (isUpstreamUpdate.current) {
        isUpstreamUpdate.current = false;
        return;
    }

    const timer = setTimeout(() => {
      setNodes(nodes => nodes.map(node => {
        if (node.id !== id) return node;
        
        const currentNodeSettings = node.data.settings || {};
        
        // We merge local settings into the node settings
        // This preserves any fields in node.data.settings that are NOT tracked by this hook
        // (though usually this hook should track the whole settings object)
        const newSettings = { ...currentNodeSettings, ...settings };
        
        if (isEqual(currentNodeSettings, newSettings)) return node;
        
        return {
          ...node,
          data: {
            ...node.data,
            settings: newSettings
          }
        };
      }));
    }, debounceTime);

    return () => clearTimeout(timer);
  }, [settings, id, setNodes, debounceTime]);

  // Helper to update a subset of settings
  const updateSettings = useCallback((updates: Partial<T> | ((prev: T) => Partial<T>)) => {
    setSettings(prev => {
      const newValues = typeof updates === 'function' ? updates(prev) : updates;
      return { ...prev, ...newValues };
    });
  }, []);

  return [settings, updateSettings] as const;
}
