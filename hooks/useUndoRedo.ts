import { useState, useCallback, useRef, useEffect } from 'react';
import { Node, Edge } from 'reactflow';
import { crc32 } from '../utils/hashUtils';
import { NodeData } from '../types';

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

// Helper to prune node data for structural hashing
// Excludes heavy runtime fields (textures, buffers) and UI state
const getStructuralNode = (node: Node): any => {
  const data = node.data as NodeData;
  
  // Prune heavy fields from data
  const prunedData: Partial<NodeData> = {
    label: data.label,
    glsl: data.glsl,
    inputs: data.inputs,
    outputs: data.outputs,
    outputType: data.outputType,
    // Keep uniforms but maybe prune large values if needed?
    // For now, we keep uniforms structure as they define the node state
    uniforms: data.uniforms, 
    // Exclude preview, executionError, serverUrl (unless critical), uploadInterval
    // Exclude resolution if it's just for preview? Maybe keep it.
    resolution: data.resolution,
    
    // Compound/Global
    isCompound: data.isCompound,
    scopeId: data.scopeId,
    internalNodes: data.internalNodes, // This might be heavy, but defines structure
    internalEdges: data.internalEdges,
    isGlobalVar: data.isGlobalVar,
    globalName: data.globalName,
    value: data.value,

    // Settings: Prune large buffers or non-structural UI state
    settings: data.settings ? { ...data.settings } : undefined
  };

  // Special handling for Paint/Fluid/etc to remove large buffers
  if (prunedData.settings) {
     // Remove potentially large arrays (Uint8Array, Float32Array, etc.)
     Object.keys(prunedData.settings).forEach(key => {
         const val = prunedData.settings![key];
         if (ArrayBuffer.isView(val) || val instanceof ArrayBuffer) {
             delete prunedData.settings![key];
         }
         // Also remove very long arrays that might be serialized
         if (Array.isArray(val) && val.length > 100) {
             delete prunedData.settings![key];
         }
     });
  }

  // Prune internalNodes/internalEdges if they are too heavy (e.g. for Group nodes)
  // We only keep a summary or hash if possible, but for now let's just be careful.
  if (prunedData.internalNodes) {
      // Recursively prune internal nodes? Or just rely on them being small?
      // For now, let's assume internal nodes are structural and important.
  }

  // Remove dynamic texture references from uniforms if they are just runtime handles?
  // Actually, if the handle string changes, it might mean a reset. 
  // But usually we want to track the *definition* of the graph.

  return {
    id: node.id,
    type: node.type,
    position: { x: Number(node.position.x.toFixed(2)), y: Number(node.position.y.toFixed(2)) }, // Round to 2 decimals to avoid float noise but capture small moves
    parentNode: node.parentNode,
    extent: node.extent,
    data: prunedData
  };
};

const getStructuralEdge = (edge: Edge): any => {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle,
    type: edge.type,
    // Exclude 'selected', 'animated' (unless structural)
    data: edge.data
  };
};

// Global cache for structural hashes to avoid re-computing for unchanged nodes
const nodeHashCache = new WeakMap<Node, string>();
const edgeHashCache = new WeakMap<Edge, string>();

export function useUndoRedo(
  nodes: Node[],
  edges: Edge[],
  setNodes: (nodes: Node[] | ((nds: Node[]) => Node[])) => void,
  setEdges: (edges: Edge[] | ((eds: Edge[]) => Edge[])) => void
) {
  const [past, setPast] = useState<HistoryState[]>([]);
  const [future, setFuture] = useState<HistoryState[]>([]);
  
  // We need to track if the current change is caused by undo/redo to avoid pushing it to history
  const isRestoring = useRef(false);
  // Track if we are in a "stabilization" period after undo/redo where we accept automatic fixes without clearing future
  const isStabilizing = useRef(false);
  
  // Debounce tracking
  const lastStateRef = useRef<HistoryState>({ nodes, edges });
  const lastHashRef = useRef<string>(''); // Store the hash of the last committed state
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to compute hash for a list of nodes/edges using cache
  const computeStateHash = useCallback((currentNodes: Node[], currentEdges: Edge[]) => {
      // Sort by ID to ensure order independence
      const sortedNodes = [...currentNodes].sort((a, b) => a.id.localeCompare(b.id));
      const sortedEdges = [...currentEdges].sort((a, b) => a.id.localeCompare(b.id));

      // Compute node hashes (using cache)
      const nodeHashes = sortedNodes.map(node => {
          if (nodeHashCache.has(node)) return nodeHashCache.get(node)!;
          
          const structural = getStructuralNode(node);
          // Use fast-json-stable-stringify concept or just JSON.stringify since we pruned it
          const hash = JSON.stringify(structural); 
          nodeHashCache.set(node, hash);
          return hash;
      });

      // Compute edge hashes (using cache)
      const edgeHashes = sortedEdges.map(edge => {
          if (edgeHashCache.has(edge)) return edgeHashCache.get(edge)!;
          
          const structural = getStructuralEdge(edge);
          const hash = JSON.stringify(structural);
          edgeHashCache.set(edge, hash);
          return hash;
      });

      // Combine all hashes
      // We join with a separator to avoid collision
      return crc32(nodeHashes.join('|') + '||' + edgeHashes.join('|'));
  }, []);

  // Function to take a snapshot
  const takeSnapshot = useCallback(() => {
    if (isRestoring.current) return;

    // Skip snapshot if any node is currently being dragged.
    if (nodes.some(n => n.dragging)) return;

    const currentNodes = nodes;
    const currentEdges = edges;
    const lastState = lastStateRef.current;

    const currentHash = computeStateHash(currentNodes, currentEdges);

    // Initialize hash if empty (first run)
    if (!lastHashRef.current) {
         lastHashRef.current = computeStateHash(lastState.nodes, lastState.edges);
    }

    if (currentHash === lastHashRef.current) {
      return;
    }

    // If we are stabilizing (e.g. component normalization after undo), update the baseline but don't clear future
    if (isStabilizing.current) {
        lastStateRef.current = { nodes: currentNodes, edges: currentEdges };
        lastHashRef.current = currentHash;
        return;
    }

    setPast((old) => {
      const newPast = [...old, lastState];
      // Limit history size to 50
      if (newPast.length > 50) return newPast.slice(newPast.length - 50);
      return newPast;
    });
    setFuture([]); // Clear future on new change
    
    // Save the FULL state (including selection) so we restore exactly what was there
    lastStateRef.current = { nodes: currentNodes, edges: currentEdges };
    lastHashRef.current = currentHash;
  }, [nodes, edges, computeStateHash]);


  const pendingSnapshotType = useRef<'structural' | 'property' | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
      isMounted.current = true;
      
      // Initialize hash on mount to ensure consistent state
      if (!lastHashRef.current) {
          lastHashRef.current = computeStateHash(nodes, edges);
      }

      return () => { isMounted.current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-record changes with debounce
  useEffect(() => {
    if (isRestoring.current) {
        isRestoring.current = false;
        return;
    }

    // Detect structural changes (Add/Remove Nodes or Edges)
    const prevNodes = lastStateRef.current.nodes;
    const prevEdges = lastStateRef.current.edges;
    const isStructuralChange = nodes.length !== prevNodes.length || edges.length !== prevEdges.length;
    const changeType = isStructuralChange ? 'structural' : 'property';

    // Manual debounce logic:
    // Only clear the previous timeout if the PENDING snapshot is a 'property' change.
    // If the pending snapshot is 'structural', we let it run to ensure we capture that state 
    // before merging in the new changes.
    if (timeoutRef.current) {
        if (pendingSnapshotType.current !== 'structural') {
            clearTimeout(timeoutRef.current);
        }
    }

    // If structural change, use a very short delay
    const delay = isStructuralChange ? 10 : 500;
    pendingSnapshotType.current = changeType;

    timeoutRef.current = setTimeout(() => {
        if (isMounted.current) {
            takeSnapshot();
        }
        // We don't nullify timeoutRef.current here because it might have been overwritten by a newer timer
    }, delay);

    // No cleanup function here! We manage timeouts manually to allow structural snapshots to persist.
  }, [nodes, edges, takeSnapshot]);




  const undo = useCallback(() => {
    // Check for unsaved changes before undoing
    // If there are pending changes (e.g. inside the debounce window), save them first
    // so the user can undo TO the current state, rather than losing it.
    const currentHash = computeStateHash(nodes, edges);
    if (currentHash !== lastHashRef.current) {
        takeSnapshot();
        // After taking snapshot, the 'current' state is now in 'past'.
        // We need to re-evaluate 'past' in the next render cycle or force update?
        // Actually, takeSnapshot updates 'past' state. But 'past' in this closure is stale?
        // No, 'past' is a dependency. But takeSnapshot calls setPast.
        // We cannot see the updated 'past' immediately in this function execution.
        
        // However, if we just saved the current state, it means the "Undo" action 
        // should now revert this just-saved state to the previous one.
        // But wait, if we save it, it goes to 'past'.
        // So we effectively want to:
        // 1. Save current state to 'past' (done by takeSnapshot)
        // 2. Perform undo immediately.
        
        // BUT, since setPast is async, we can't do it in one go easily.
        // A simpler approach: If unsaved changes exist, 'Undo' acts as 'Save & Revert to Last Committed'.
        // Which is exactly what takeSnapshot does (saves current).
        // So if we call takeSnapshot(), we are effectively "committing" the current state.
        // The USER wants to Undo the current state.
        // If we commit it, then the NEXT undo will undo it.
        // So, if unsaved changes exist, we should probably just commit them and STOP?
        // No, the user clicked Undo. They expect a change.
        
        // Let's look at standard behavior (e.g. VS Code):
        // If I type "A", wait 1ms, type "B", hit Undo.
        // It undoes "B".
        // Here, "B" is the unsaved change.
        // So we need to ensure "A" is in history, and "B" is current.
        // If "A" is already in history (it is), and "B" is current (unsaved).
        // We want to go back to "A".
        // So we just need to discard "B" and load "A".
        // We DON'T need to save "B" to 'past'. We need to save "B" to 'future' (Redo stack).
        
        // So:
        // 1. Push current (unsaved) state to Future.
        // 2. Restore Last Committed State (from lastStateRef, NOT past).
        // Wait, lastStateRef IS the last committed state (A).
        // So we just need to reload lastStateRef?
        
        // Let's verify:
        // Past: [Empty]
        // LastStateRef: [Node A]
        // Current Nodes: [Node A + B] (Unsaved)
        
        // Undo Clicked.
        // We want to go back to [Node A].
        // So we setNodes(lastStateRef.nodes).
        // And we push [Node A + B] to Future.
        
        // Is this covered by standard logic?
        // Standard logic:
        // const previous = past[last]; -> [Empty]
        // setNodes(previous). -> [Empty]
        // Result: Node A is lost! We went back too far.
        
        // CORRECT LOGIC for Unsaved Changes:
        // If current != lastStateRef:
        //    Target = lastStateRef.
        //    Future = Current.
        //    Restore Target.
        //    (We do NOT touch 'past' stack).
        
        setFuture((oldFuture) => [{ nodes, edges }, ...oldFuture]);
        isRestoring.current = true;
        setNodes(lastStateRef.current.nodes);
        setEdges(lastStateRef.current.edges);
        // Hash is already lastHashRef.current
        return;
    }

    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    // Save current state to future
    setFuture((oldFuture) => [{ nodes, edges }, ...oldFuture]);
    
    isRestoring.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    lastStateRef.current = previous;
    
    // Update hash to match restored state
    lastHashRef.current = computeStateHash(previous.nodes, previous.edges);

    setPast(newPast);
    
    // Enable stabilization period to allow components to normalize their data (e.g. adding missing defaults)
    // without breaking the Redo stack.
    isStabilizing.current = true;
    setTimeout(() => { isStabilizing.current = false; }, 100);

  }, [past, nodes, edges, setNodes, setEdges, computeStateHash]);


  const redo = useCallback(() => {
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    // Save current state to past
    setPast((oldPast) => [...oldPast, { nodes, edges }]);

    isRestoring.current = true;
    setNodes(next.nodes);
    setEdges(next.edges);
    lastStateRef.current = next;

    // Update hash to match restored state
    lastHashRef.current = computeStateHash(next.nodes, next.edges);

    setFuture(newFuture);
    
    // Enable stabilization period
    isStabilizing.current = true;
    setTimeout(() => { isStabilizing.current = false; }, 100);

  }, [future, nodes, edges, setNodes, setEdges, computeStateHash]);



  // Check if there are unsaved changes
  // We use a ref to track this to avoid re-rendering too often, but for the UI button we need state.
  // However, computing hash on every render is expensive.
  // We can use a debounced check or just check it when nodes/edges change reference.
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
      if (isRestoring.current) {
          setHasUnsavedChanges(false);
          return;
      }
      
      // Quick check: if counts differ, definitely changed
      if (nodes.length !== lastStateRef.current.nodes.length || edges.length !== lastStateRef.current.edges.length) {
          setHasUnsavedChanges(true);
          return;
      }

      // Deep check (debounced slightly or just run it? WeakMap makes it fast)
      // We'll run it because the user wants immediate feedback.
      const currentHash = computeStateHash(nodes, edges);
      setHasUnsavedChanges(currentHash !== lastHashRef.current);
  }, [nodes, edges, computeStateHash]);

  return {
    undo,
    redo,
    canUndo: past.length > 0 || hasUnsavedChanges,
    canRedo: future.length > 0,
    takeSnapshot, // Expose this if we want to force save before big operations
    // Expose stack sizes for debugging/stats
    undoStackSize: past.length,
    redoStackSize: future.length
  };
}
