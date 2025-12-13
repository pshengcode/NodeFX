import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from 'reactflow';
import { useTranslation } from 'react-i18next';
import { crc32 } from '../utils/hashUtils';

import { NodeData, CompilationResult, ShaderNodeDefinition } from '../types';
import { getNodeDefinition } from '../nodes/registry';

// Hooks
import { useExternalNodes } from '../hooks/useExternalNodes';
import { usePersistence } from '../hooks/usePersistence';
import { useUndoRedo } from '../hooks/useUndoRedo';
import { useUrlSharing, loadFlowFromUrl } from '../hooks/useUrlSharing';
import { useTypeInference } from '../hooks/useTypeInference';
import { useGraphActions } from '../hooks/useGraphActions';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useFileOperations } from '../hooks/useFileOperations';
import { useShaderCompiler } from '../hooks/useShaderCompiler';
import { compileCompoundNode } from '../utils/shaderCompiler';
import { useUserLibrary } from '../hooks/useUserLibrary';
import { sanitizeType } from '../utils/inferenceHelpers';

// Initial state helpers
const initialDef = getNodeDefinition('IMAGE');
const initialNodes: Node<NodeData>[] = initialDef ? [
  {
    id: '1',
    type: 'customShader',
    position: { x: 250, y: 200 },
    data: { ...initialDef.data, label: initialDef.label, preview: true, resolution: { w: 512, h: 512 } } as NodeData,
    zIndex: 10, 
  },
] : [];

const initialEdges: Edge[] = [];

interface ProjectContextType {
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: React.Dispatch<React.SetStateAction<Node<NodeData>[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  performanceStats: { undoStackSize: number; redoStackSize: number };
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  
  previewNodeId: string | null;
  setPreviewNodeId: (id: string | null) => void;
  
  compiledData: CompilationResult | null;
  setCompiledData: (data: CompilationResult | null) => void;
  
  resolution: { w: number; h: number };
  setResolution: (res: { w: number; h: number }) => void;
  
  reactFlowInstance: ReactFlowInstance | null;
  setReactFlowInstance: (instance: ReactFlowInstance | null) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement>;

  // Actions from hooks
  onConnect: OnConnect;
  addNode: (def: ShaderNodeDefinition, position?: { x: number; y: number }, initialValues?: any) => void;
  onNodeClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop: (event: React.MouseEvent, node: Node) => void;
  onNodesDelete: (nodesToDelete: Node[]) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  takeSnapshot: () => void;
  
    copyShareLink: (
        nodes: Node<NodeData>[],
        edges: Edge[],
        previewNodeId: string | null
    ) => Promise<import('../hooks/useUrlSharing').ShareLinkResult | null>;
  
  saveProject: () => void;
  loadProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importNodeFromJson: (event: React.ChangeEvent<HTMLInputElement>) => void;
  resetCanvas: () => void;
  
  externalNodes: ShaderNodeDefinition[];
  isRefreshingNodes: boolean;
  refreshExternalNodes: () => Promise<void>;
  nodesByCategory: Record<string, ShaderNodeDefinition[]>;
  fullRegistry: Record<string, ShaderNodeDefinition>;
  nodeRegistryList: ShaderNodeDefinition[];

  // Refs for file inputs
  projectFileInputRef: React.RefObject<HTMLInputElement>;
  nodeImportInputRef: React.RefObject<HTMLInputElement>;
  
  // Share handling
  pendingShareData: { nodes: Node<NodeData>[], edges: Edge[], previewNodeId?: string | null } | null;
  handleShareAction: (action: 'overwrite' | 'merge' | 'cancel') => void;
  
  loadExampleProject: () => Promise<boolean>;

  // Scope Management
  currentScope: string;
  enterGroup: (nodeId: string) => void;
  exitGroup: () => void;
  navigateToScope: (scopeId: string) => void;
  getBreadcrumbs: () => Array<{ id: string; label: string }>;

  // User Library
  userNodes: import('../types').LibraryItem[];
  addToLibrary: (nodeData: NodeData) => void;
  addCanvasToLibrary: (label: string, description?: string) => void;
  removeFromLibrary: (id: string) => void;
  importLibrary: (json: string) => boolean;
  exportLibrary: () => void;
  
  // Performance State
  isDragging: boolean;
  performanceStats: { 
    undoStackSize: number; 
    redoStackSize: number;
    compileStats: { totalCompiles: number; totalErrors: number; lastCompileTime: number };
  };
}

// Split Contexts for Performance
const ProjectContext = createContext<ProjectContextType | null>(null);
const ProjectDispatchContext = createContext<Omit<ProjectContextType, 'nodes' | 'edges'> | null>(null);

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};

export const useProjectDispatch = () => {
    const context = useContext(ProjectDispatchContext);
    if (!context) {
      throw new Error('useProjectDispatch must be used within a ProjectProvider');
    }
    return context;
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const nodeImportInputRef = useRef<HTMLInputElement>(null);

  // 0. Initialization Logic
  const initialFlow = useMemo(() => {
    try {
      const saved = localStorage.getItem('glsl-app-flow');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Failed to load flow from storage", e);
    }
    return null;
  }, []);

  // 1. State Management
  const [nodes, setNodes] = useNodesState(initialFlow?.nodes || initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow?.edges || initialEdges);
  
  const [previewNodeId, setPreviewNodeIdState] = useState<string | null>(() => {
      const savedId = initialFlow?.previewNodeId;
      const defaultId = '1';
      const initialNodeList = initialFlow?.nodes || initialNodes;
      if (savedId && initialNodeList.find((n: Node) => n.id === savedId)) return savedId;
      if (initialNodeList.find((n: Node) => n.id === defaultId)) return defaultId;
      return initialNodeList.length > 0 ? initialNodeList[0].id : null;
  });

  // Robust Preview Setter: Updates both state and node data to ensure consistency
  const setPreviewNodeId = useCallback((id: string | null) => {
      setPreviewNodeIdState(id);
      setNodes(nds => nds.map(n => {
          const shouldBePreview = n.id === id;
          if (n.data.preview !== shouldBePreview) {
              return { ...n, data: { ...n.data, preview: shouldBePreview } };
          }
          return n;
      }));
  }, [setNodes]);

  // Sync State from Nodes (Handle Undo/Redo)
  useEffect(() => {
      // Find the node that claims to be the preview
      const activePreviewNode = nodes.find(n => n.data.preview);
      const activeId = activePreviewNode ? activePreviewNode.id : null;
      
      // If state doesn't match visual reality (e.g. after Undo), sync state to reality
      if (activeId !== previewNodeId) {
          setPreviewNodeIdState(activeId);
      }
  }, [nodes, previewNodeId]);

  const [compiledData, setCompiledData] = useState<CompilationResult | null>(null);
  const [resolution, setResolution] = useState<{w: number, h: number}>({ w: 512, h: 512 });
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [currentScope, setCurrentScope] = useState<string>('root');
  const [isDragging, setIsDragging] = useState(false);
  const viewportStack = useRef<Record<string, { x: number, y: number, zoom: number }>>({});

  // Visibility Effect
  useEffect(() => {
      if (isDragging) return; // Skip visibility updates during drag
      setNodes(nds => nds.map(n => {
          const isVisible = (n.data.scopeId || 'root') === currentScope;
          if (n.hidden !== !isVisible) {
              return { ...n, hidden: !isVisible };
          }
          return n;
      }));


      // Viewport Management
      if (reactFlowInstance) {
          if (viewportStack.current[currentScope]) {
              reactFlowInstance.setViewport(viewportStack.current[currentScope]);
          } else {
              setTimeout(() => reactFlowInstance.fitView({ duration: 300, padding: 0.2 }), 10);
          }
      }
  }, [currentScope, setNodes, reactFlowInstance]);

  const enterGroup = (nodeId: string) => {
      if (reactFlowInstance) {
          viewportStack.current[currentScope] = reactFlowInstance.getViewport();
      }

      setCurrentScope(nodeId);
      setNodes(nds => {
          const inputId = `input-proxy-${nodeId}`;
          const outputId = `output-proxy-${nodeId}`;
          const hasInput = nds.some(n => n.id === inputId);
          const hasOutput = nds.some(n => n.id === outputId);
          
          if (hasInput && hasOutput) return nds;

          let newNodes = [...nds];
          const parentNode = nds.find(n => n.id === nodeId);
          if (!parentNode) return nds;

          if (!hasInput) {
              newNodes.push({
                  id: inputId,
                  type: 'graphInput',
                  position: { x: 0, y: 200 },
                  data: { ...parentNode.data, scopeId: nodeId, label: 'Inputs' },
                  draggable: true,
                  hidden: false 
              });
          }
          if (!hasOutput) {
              newNodes.push({
                  id: outputId,
                  type: 'graphOutput',
                  position: { x: 800, y: 200 },
                  data: { ...parentNode.data, scopeId: nodeId, label: 'Outputs' },
                  draggable: true,
                  hidden: false 
              });
          }
          return newNodes;
      });
      // Clear selection
      setNodes(nds => nds.map(n => ({ ...n, selected: false })));
  };

  const exitGroup = () => {
      if (currentScope === 'root') return;
      
      const currentNode = nodes.find(n => n.id === currentScope);
      const parentScope = currentNode?.data.scopeId || 'root';
      
      // Compile Subgraph
      if (currentNode) {
          const glsl = compileCompoundNode(currentNode, nodes, edges);
          setNodes(nds => nds.map(n => {
              if (n.id === currentScope) {
                  return { ...n, data: { ...n.data, glsl } };
              }
              return n;
          }));
      }

      setCurrentScope(parentScope);
  };

  const navigateToScope = (scopeId: string) => {
      if (scopeId === currentScope) return;
      
      if (reactFlowInstance) {
          viewportStack.current[currentScope] = reactFlowInstance.getViewport();
      }

      // If navigating UP (or to root), we might need to compile the current scope before leaving
      // But if we jump multiple levels, we should probably compile everything along the path?
      // For simplicity, let's just trigger a compile of the *current* scope if it's not root
      if (currentScope !== 'root') {
          const currentNode = nodes.find(n => n.id === currentScope);
          if (currentNode) {
              const glsl = compileCompoundNode(currentNode, nodes, edges);
              setNodes(nds => nds.map(n => {
                  if (n.id === currentScope) {
                      return { ...n, data: { ...n.data, glsl } };
                  }
                  return n;
              }));
          }
      }

      // If target is root, just set it
      if (scopeId === 'root') {
          setCurrentScope('root');
          return;
      }

      // If target is a node, use enterGroup logic to ensure proxies exist
      enterGroup(scopeId);
  };

  const getBreadcrumbs = () => {
      const crumbs = [];
      let curr = currentScope;
      
      while (curr !== 'root') {
          const node = nodes.find(n => n.id === curr);
          if (node) {
              crumbs.unshift({ id: node.id, label: node.data.label });
              curr = node.data.scopeId || 'root';
          } else {
              // Broken chain
              curr = 'root';
          }
      }
      
      crumbs.unshift({ id: 'root', label: 'Main' });
      return crumbs;
  };
  
  // 2. Custom Hooks
  const { 
    externalNodes, 
    isRefreshingNodes, 
    refreshExternalNodes, 
    nodesByCategory,
    fullRegistry
  } = useExternalNodes();

  const {
      userNodes,
      addToLibrary,
      addCanvasToLibrary: addCanvasToLibraryHook,
      removeFromLibrary,
      importLibrary,
      exportLibrary
  } = useUserLibrary();

  // Wrapper for addCanvasToLibrary to use current context state
  const addCanvasToLibrary = useCallback((label: string, description?: string) => {
      addCanvasToLibraryHook(label, nodes, edges, previewNodeId, description);
  }, [addCanvasToLibraryHook, nodes, edges, previewNodeId]);

  // Merge User Nodes into nodesByCategory and fullRegistry
  const allNodesByCategory = useMemo(() => {
      const merged = { ...nodesByCategory };
      // Always include User category so it appears in Sidebar (for Import/Export)
      merged['User'] = userNodes;
      return merged;
  }, [nodesByCategory, userNodes]);

  const allFullRegistry = useMemo(() => {
      const merged: Record<string, ShaderNodeDefinition> = {};
      
      // Convert array to record keyed by ID
      if (Array.isArray(fullRegistry)) {
          fullRegistry.forEach(n => {
              merged[n.id] = n;
          });
      }

      userNodes.forEach(n => {
          merged[n.id] = n;
      });
      return merged;
  }, [fullRegistry, userNodes]);

  const nodeRegistryList = useMemo(() => {
      return Object.values(allFullRegistry);
  }, [allFullRegistry]);

  const { 
      onNodesChange: onNodesChangeAction, 
      onConnect, 
      addNode, 
      onNodeClick, 
      onNodeDragStart,
      onNodeDragStop, 
      onNodesDelete,
      onDragOver,
      onDrop
  } = useGraphActions(
      nodes, setNodes, edges, setEdges, previewNodeId, setPreviewNodeId, setCompiledData, resolution,
      reactFlowWrapper, reactFlowInstance, allFullRegistry, currentScope, setIsDragging
  );

  const { clearPersistence } = usePersistence(nodes, edges, previewNodeId, setNodes, setEdges, initialNodes, initialEdges);
  const { undo, redo, canUndo, canRedo, takeSnapshot, undoStackSize, redoStackSize } = useUndoRedo(nodes, edges, setNodes, setEdges);
  const { copyShareLink } = useUrlSharing();
  const { runTypeInference } = useTypeInference();
  
  useKeyboardShortcuts(nodes, setNodes, edges, setEdges, resolution, undo, redo, currentScope, reactFlowInstance, isDragging);
  const compileStats = useShaderCompiler(nodes, edges, previewNodeId, setCompiledData, isDragging);
  
  // Performance Stats
  const performanceStats = useMemo(() => ({
    undoStackSize,
    redoStackSize,
    compileStats
  }), [undoStackSize, redoStackSize, compileStats]);

  const { 
      saveProject, 
      loadProject, 
      importNodeFromJson, 
      resetCanvas,
      loadExampleProject
  } = useFileOperations(
      nodes, edges, setNodes, setEdges, setPreviewNodeId, resolution, addNode, clearPersistence, initialNodes, initialEdges, projectFileInputRef, nodeImportInputRef
  );

  // Auto-load Example Project on First Visit
  useEffect(() => {
      const hasVisited = localStorage.getItem('hasVisited');
      if (!hasVisited) {
          loadExampleProject().then((success) => {
              if (success) {
                  localStorage.setItem('hasVisited', 'true');
              }
          });
      }
  }, [loadExampleProject]);

  // Keep a ref to nodes for event listeners
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // const prevPreviewNodeId = useRef<string | null>(null); // Removed


  // Share Logic
  const [pendingShareData, setPendingShareData] = useState<{ nodes: Node<NodeData>[], edges: Edge[], previewNodeId?: string | null } | null>(null);

  useEffect(() => {
    const checkUrl = () => {
        const urlFlow = loadFlowFromUrl();
        if (urlFlow) {
            const currentNodes = nodesRef.current;
            const hasLocalWork = currentNodes.length > 1 || (currentNodes.length === 1 && currentNodes[0].id !== '1'); 
            
            if (hasLocalWork) {
                setPendingShareData(urlFlow);
            } else {
                setNodes(urlFlow.nodes);
                setEdges(urlFlow.edges);
                if (urlFlow.previewNodeId) setPreviewNodeId(urlFlow.previewNodeId);
                window.history.replaceState(null, '', window.location.pathname);
            }
        }
    };
    checkUrl();
    window.addEventListener('hashchange', checkUrl);
    return () => window.removeEventListener('hashchange', checkUrl);
  }, []);

  const handleShareAction = (action: 'overwrite' | 'merge' | 'cancel') => {
      if (!pendingShareData) return;

      if (action === 'overwrite') {
          takeSnapshot();
          setNodes(pendingShareData.nodes);
          setEdges(pendingShareData.edges);
          if (pendingShareData.previewNodeId) setPreviewNodeId(pendingShareData.previewNodeId);
      } 
      else if (action === 'merge') {
          takeSnapshot();
          let maxX = -Infinity;
          nodes.forEach(n => { if (n.position.x > maxX) maxX = n.position.x; });
          const offsetX = maxX === -Infinity ? 0 : maxX + 400;
          const timestamp = Date.now();
          const idMap: Record<string, string> = {};
          pendingShareData.nodes.forEach((n: Node) => { idMap[n.id] = `${n.id}_shared_${timestamp}`; });

          // Remap any uniform values that embed node IDs (e.g. dynamic://<nodeId>)
          // so merged graphs remain internally consistent after id remapping.
          const remapEmbeddedNodeId = (val: unknown): unknown => {
              if (typeof val !== 'string') return val;

              const prefixes = ['dynamic://', 'fluid://', 'particle://', 'image://', 'video://', 'webcam://'];
              for (const prefix of prefixes) {
                  if (!val.startsWith(prefix)) continue;
                  const suffix = val.slice(prefix.length);
                  const remapped = idMap[suffix];
                  if (remapped) return `${prefix}${remapped}`;
              }
              return val;
          };

          const remapUniforms = (uniforms: any) => {
              if (!uniforms || typeof uniforms !== 'object') return uniforms;
              const next: any = Array.isArray(uniforms) ? [...uniforms] : { ...uniforms };
              for (const [key, u] of Object.entries(next)) {
                  if (!u || typeof u !== 'object') continue;
                  if ('value' in (u as any)) {
                      (next as any)[key] = { ...(u as any), value: remapEmbeddedNodeId((u as any).value) };
                  }
              }
              return next;
          };

          const newNodes: Node[] = pendingShareData.nodes.map((n: Node) => {
              const newId = idMap[n.id];
              const isChildOfImportedNode = n.parentId && idMap[n.parentId];
              
              // Fix: Also remap scopeId if it points to an imported node
              const currentScopeId = n.data?.scopeId;
              const newScopeId = (currentScopeId && idMap[currentScopeId]) ? idMap[currentScopeId] : currentScopeId;

              const remappedUniforms = remapUniforms((n as any).data?.uniforms);

              return {
                  ...n,
                  id: newId,
                  parentId: isChildOfImportedNode ? idMap[n.parentId!] : n.parentId,
                  position: isChildOfImportedNode ? n.position : { x: n.position.x + offsetX, y: n.position.y },
                  data: {
                      ...n.data,
                      scopeId: newScopeId,
                      uniforms: remappedUniforms
                  },
                  selected: true 
              };
          });

          const newEdges: Edge[] = pendingShareData.edges.map((e: Edge) => ({
              ...e,
              id: `e_${e.source}_${e.target}_${timestamp}`,
              source: idMap[e.source] || e.source,
              target: idMap[e.target] || e.target,
          }));

          setNodes((nds) => [...nds, ...newNodes]);
          setEdges((eds) => [...eds, ...newEdges]);
      }
      setPendingShareData(null);
      window.history.replaceState(null, '', window.location.pathname);
  };

  // Optimized Preview Sync - REMOVED (Handled by setPreviewNodeId and Undo/Redo sync)
  /*
  useEffect(() => {
      if (previewNodeId === prevPreviewNodeId.current) return;
      
      const oldId = prevPreviewNodeId.current;
      const newId = previewNodeId;
      prevPreviewNodeId.current = newId;

      setNodes(nds => nds.map(n => {
          // Only update the specific nodes that changed status
          if (n.id === oldId) return { ...n, data: { ...n.data, preview: false } };
          if (n.id === newId) return { ...n, data: { ...n.data, preview: true } };
          return n;
      }));
  }, [previewNodeId, setNodes]);
  */

  // Canvas Size Event
  useEffect(() => {
    const handleSetCanvasSize = (e: Event) => {
        const customEvent = e as CustomEvent;
        if (customEvent.detail) {
            setResolution(customEvent.detail);
        }
    };
    window.addEventListener('GLSL_SET_CANVAS_SIZE', handleSetCanvasSize);
    return () => window.removeEventListener('GLSL_SET_CANVAS_SIZE', handleSetCanvasSize);
  }, []);

  // AUTO-CASTING LOGIC: Watch edges to update Polymorphic nodes
  // Compute a signature that changes ONLY when relevant type/GLSL structure changes.
  // This intentionally ignores positions and uniform VALUES, so dragging sliders/nodes
  // won't spam inference, but editing GLSL or changing inferred types WILL retrigger.
  const graphTypeSignature = useMemo(() => {
      if (isDragging) return ""; // Skip computation during drag

      return nodes
          .map(n => {
              const inputsSig = (n.data.inputs || []).map(i => `${i.id}:${i.type}`).join(',');
              const outputsSig = (n.data.outputs || []).map(o => `${o.id}:${o.type}`).join(',');
              const glslSig = n.data.glsl ? crc32(n.data.glsl) : '';
              const autoTypeSig = n.data.autoType ? '1' : '0';
              return `${n.id}:${n.type}:${autoTypeSig}:${n.data.outputType}:i[${inputsSig}]:o[${outputsSig}]:g[${glslSig}]`;
          })
          .join('|');
  }, [nodes, isDragging]);

  useEffect(() => {
    if (isDragging) return; // Skip heavy inference during drag
    if (nodesRef.current.length === 0) return;

    const currentNodes = nodesRef.current;
    let nextNodes = currentNodes;
    let nodesChanged = false;

    // 1. Run Type Inference
    const inferredNodes = runTypeInference(currentNodes, edges);
    if (inferredNodes) {
        nextNodes = inferredNodes;
        nodesChanged = true;
    }

    // 2. Validate Edges
    const edgesToRemove: string[] = [];
    edges.forEach(edge => {
        const sourceNode = nextNodes.find(n => n.id === edge.source);
        const targetNode = nextNodes.find(n => n.id === edge.target);
        
        if (!sourceNode || !targetNode) return;

        // Get Source Type
        let sourceType = sourceNode.data.outputType;
        if (edge.sourceHandle) {
             const out = sourceNode.data.outputs?.find(o => o.id === edge.sourceHandle);
             if (out) sourceType = out.type;
             if (sourceNode.type === 'graphInput') {
                 const inp = sourceNode.data.inputs.find(i => i.id === edge.sourceHandle);
                 if (inp) sourceType = inp.type;
             }
        }

        // Get Target Type
        let targetType = 'float';
        if (edge.targetHandle) {
            const inp = targetNode.data.inputs.find(i => i.id === edge.targetHandle);
            if (inp) targetType = inp.type;
             if (targetNode.type === 'graphOutput') {
                 const out = targetNode.data.outputs?.find(o => o.id === edge.targetHandle);
                 if (out) targetType = out.type;
             }
        }

        const sType = sanitizeType(sourceType);
        const tType = sanitizeType(targetType);

        const isVectorOrScalar = (t: string) => ['float', 'int', 'vec2', 'vec3', 'vec4'].includes(t);

        if (sType !== tType) {
            if (tType === 'sampler2D') return; // Allow Multi-pass
            if (isVectorOrScalar(sType) && isVectorOrScalar(tType)) return; // Allow casting
            edgesToRemove.push(edge.id);
        }
    });

    if (nodesChanged) {
        setNodes(nextNodes);
    }
    
    if (edgesToRemove.length > 0) {
        setTimeout(() => {
             setEdges(eds => eds.filter(e => !edgesToRemove.includes(e.id)));
        }, 0);
    }

  }, [edges, graphTypeSignature, runTypeInference, setNodes, setEdges, isDragging]);

  // Stable Dispatch Context Value (Memoized to avoid updates on node position changes)
  const dispatchValue = useMemo(() => ({
    setNodes, setEdges, onNodesChange: onNodesChangeAction, onEdgesChange,
    previewNodeId, setPreviewNodeId,
    compiledData, setCompiledData,
    resolution, setResolution,
    reactFlowInstance, setReactFlowInstance, reactFlowWrapper,
    onConnect, addNode, onNodeClick, onNodeDragStart, onNodeDragStop, onNodesDelete, onDragOver, onDrop,
    undo, redo, canUndo, canRedo, takeSnapshot,
    performanceStats,
    copyShareLink,
    saveProject, loadProject, importNodeFromJson, resetCanvas, loadExampleProject,
    userNodes, addToLibrary, addCanvasToLibrary, removeFromLibrary, importLibrary, exportLibrary,
    nodesByCategory: allNodesByCategory, fullRegistry: allFullRegistry, nodeRegistryList,
    currentScope, enterGroup, exitGroup, navigateToScope, getBreadcrumbs,
    externalNodes, isRefreshingNodes, refreshExternalNodes,
    projectFileInputRef, nodeImportInputRef,
    pendingShareData, handleShareAction,
    isDragging
  }), [
      // Dependencies that should NOT include 'nodes' or 'edges' directly
      // unless they are structural changes handled by other dependencies (like compiledData)
      setNodes, setEdges, onNodesChangeAction, onEdgesChange,
      previewNodeId, setPreviewNodeId,
      compiledData, setCompiledData,
      resolution, setResolution,
      reactFlowInstance, setReactFlowInstance, reactFlowWrapper,
      onConnect, addNode, onNodeClick, onNodeDragStart, onNodeDragStop, onNodesDelete, onDragOver, onDrop,
      undo, redo, canUndo, canRedo, takeSnapshot,
      copyShareLink,
      saveProject, loadProject, importNodeFromJson, resetCanvas, loadExampleProject,
      userNodes, addToLibrary, addCanvasToLibrary, removeFromLibrary, importLibrary, exportLibrary,
      allNodesByCategory, allFullRegistry, nodeRegistryList,
      currentScope, enterGroup, exitGroup, navigateToScope, getBreadcrumbs,
      externalNodes, isRefreshingNodes, refreshExternalNodes,
      projectFileInputRef, nodeImportInputRef,
      pendingShareData, handleShareAction,
      performanceStats
      // Note: isDragging is intentionally NOT in dependencies to avoid re-creating dispatchValue on every drag
      // Components can access the latest isDragging value, but changes won't trigger re-renders
  ]);

  const value = useMemo(() => ({
    ...dispatchValue,
    nodes, 
    edges
  }), [dispatchValue, nodes, edges]);

  return (
    <ProjectDispatchContext.Provider value={dispatchValue}>
        <ProjectContext.Provider value={value}>
            {children}
        </ProjectContext.Provider>
    </ProjectDispatchContext.Provider>
  );
};
