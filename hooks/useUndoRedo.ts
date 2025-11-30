import { useState, useCallback, useRef, useEffect } from 'react';
import { Node, Edge } from 'reactflow';

interface HistoryState {
  nodes: Node[];
  edges: Edge[];
}

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
  
  // Debounce tracking
  const lastStateRef = useRef<HistoryState>({ nodes, edges });
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to clean nodes for comparison (ignore UI states like selection)
  const cleanNode = (node: Node): any => {
    const { selected, dragging, positionAbsolute, ...rest } = node;
    return rest;
  };

  const cleanEdge = (edge: Edge): any => {
    const { selected, ...rest } = edge;
    return rest;
  };

  // Function to take a snapshot
  const takeSnapshot = useCallback(() => {
    if (isRestoring.current) return;

    // Skip snapshot if any node is currently being dragged.
    // We will capture the final state when dragging stops (dragging becomes false).
    if (nodes.some(n => n.dragging)) return;

    const currentNodes = nodes;
    const currentEdges = edges;
    const lastState = lastStateRef.current;

    // Compare cleaned states to avoid saving on selection changes
    const currentNodesClean = currentNodes.map(cleanNode);
    const lastNodesClean = lastState.nodes.map(cleanNode);
    const currentEdgesClean = currentEdges.map(cleanEdge);
    const lastEdgesClean = lastState.edges.map(cleanEdge);

    if (
      JSON.stringify(currentNodesClean) === JSON.stringify(lastNodesClean) &&
      JSON.stringify(currentEdgesClean) === JSON.stringify(lastEdgesClean)
    ) {
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
  }, [nodes, edges]);

  // Auto-record changes with debounce
  useEffect(() => {
    if (isRestoring.current) {
        // If we just restored, we don't want to snapshot this state change.
        // But we DO need to update lastStateRef to match the restored state
        // so that subsequent changes are compared against the restored state.
        // However, undo/redo functions already update lastStateRef.
        // So we just reset the flag.
        isRestoring.current = false;
        return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
        takeSnapshot();
    }, 500); // 500ms debounce for auto-saving history

    return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [nodes, edges, takeSnapshot]);


  const undo = useCallback(() => {
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    // Save current state to future
    setFuture((oldFuture) => [{ nodes, edges }, ...oldFuture]);
    
    isRestoring.current = true;
    setNodes(previous.nodes);
    setEdges(previous.edges);
    lastStateRef.current = previous;
    setPast(newPast);

  }, [past, nodes, edges, setNodes, setEdges]);

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
    setFuture(newFuture);

  }, [future, nodes, edges, setNodes, setEdges]);

  return {
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    takeSnapshot // Expose this if we want to force save before big operations
  };
}
