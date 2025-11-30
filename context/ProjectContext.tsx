import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
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
  
  copyShareLink: () => Promise<void>;
  
  saveProject: () => void;
  loadProject: (event: React.ChangeEvent<HTMLInputElement>) => void;
  importNodeFromJson: (event: React.ChangeEvent<HTMLInputElement>) => void;
  resetCanvas: () => void;
  
  externalNodes: any[];
  isRefreshingNodes: boolean;
  refreshExternalNodes: () => Promise<void>;
  nodesByCategory: Record<string, any[]>;
  fullRegistry: Record<string, ShaderNodeDefinition>;

  // Refs for file inputs
  projectFileInputRef: React.RefObject<HTMLInputElement>;
  nodeImportInputRef: React.RefObject<HTMLInputElement>;
  
  // Share handling
  pendingShareData: any;
  handleShareAction: (action: 'overwrite' | 'merge' | 'cancel') => void;

  // Scope Management
  currentScope: string;
  enterGroup: (nodeId: string) => void;
  exitGroup: () => void;
  navigateToScope: (scopeId: string) => void;
  getBreadcrumbs: () => Array<{ id: string; label: string }>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
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
  
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(() => {
      const savedId = initialFlow?.previewNodeId;
      const defaultId = '1';
      const initialNodeList = initialFlow?.nodes || initialNodes;
      if (savedId && initialNodeList.find((n: Node) => n.id === savedId)) return savedId;
      if (initialNodeList.find((n: Node) => n.id === defaultId)) return defaultId;
      return initialNodeList.length > 0 ? initialNodeList[0].id : null;
  });

  const [compiledData, setCompiledData] = useState<CompilationResult | null>(null);
  const [resolution, setResolution] = useState<{w: number, h: number}>({ w: 512, h: 512 });
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [currentScope, setCurrentScope] = useState<string>('root');
  const viewportStack = useRef<Record<string, { x: number, y: number, zoom: number }>>({});

  // Visibility Effect
  useEffect(() => {
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
      onNodesChange: onNodesChangeAction, 
      onConnect, 
      addNode, 
      onNodeClick, 
      onNodeDragStop, 
      onNodesDelete,
      onDragOver,
      onDrop
  } = useGraphActions(
      nodes, setNodes, edges, setEdges, previewNodeId, setPreviewNodeId, setCompiledData, resolution,
      reactFlowWrapper, reactFlowInstance, fullRegistry, currentScope
  );

  const { clearPersistence } = usePersistence(nodes, edges, previewNodeId, setNodes, setEdges, initialNodes, initialEdges);
  const { undo, redo, canUndo, canRedo, takeSnapshot } = useUndoRedo(nodes, edges, setNodes, setEdges);
  const { copyShareLink } = useUrlSharing();
  const { runTypeInference } = useTypeInference();
  
  useKeyboardShortcuts(nodes, setNodes, edges, setEdges, resolution, undo, redo);
  useShaderCompiler(nodes, edges, previewNodeId, setCompiledData);

  const { 
      saveProject, 
      loadProject, 
      importNodeFromJson, 
      resetCanvas 
  } = useFileOperations(
      nodes, edges, setNodes, setEdges, setPreviewNodeId, resolution, addNode, clearPersistence, initialNodes, initialEdges, projectFileInputRef, nodeImportInputRef
  );

  // Keep a ref to nodes for event listeners
  const nodesRef = useRef(nodes);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);

  // Share Logic
  const [pendingShareData, setPendingShareData] = useState<any>(null);

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

          const newNodes: Node[] = pendingShareData.nodes.map((n: Node) => {
              const newId = idMap[n.id];
              const isChildOfImportedNode = n.parentId && idMap[n.parentId];
              
              // Fix: Also remap scopeId if it points to an imported node
              const currentScopeId = n.data?.scopeId;
              const newScopeId = (currentScopeId && idMap[currentScopeId]) ? idMap[currentScopeId] : currentScopeId;

              return {
                  ...n,
                  id: newId,
                  parentId: isChildOfImportedNode ? idMap[n.parentId!] : n.parentId,
                  position: isChildOfImportedNode ? n.position : { x: n.position.x + offsetX, y: n.position.y },
                  data: {
                      ...n.data,
                      scopeId: newScopeId
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

  // Resolution Effect
  useEffect(() => {
    setNodes((nds) => nds.map((n) => {
        if (n.data.resolution?.w !== resolution.w || n.data.resolution?.h !== resolution.h) {
            return { ...n, data: { ...n.data, resolution } };
        }
        return n;
    }));
  }, [resolution, setNodes]);

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
  const graphTypeSignature = useMemo(() => {
      return nodes.map(n => `${n.id}:${n.data.outputType}`).join('|');
  }, [nodes]);

  useEffect(() => {
    if (nodes.length === 0) return;

    setNodes(currentNodes => {
        const updatedNodes = runTypeInference(currentNodes, edges);
        return updatedNodes || currentNodes;
    });

  }, [edges, graphTypeSignature, runTypeInference, setNodes]);

  const value = {
    nodes, edges, setNodes, setEdges, onNodesChange: onNodesChangeAction, onEdgesChange,
    previewNodeId, setPreviewNodeId,
    compiledData, setCompiledData,
    resolution, setResolution,
    reactFlowInstance, setReactFlowInstance, reactFlowWrapper,
    onConnect, addNode, onNodeClick, onNodeDragStop, onNodesDelete, onDragOver, onDrop,
    undo, redo, canUndo, canRedo, takeSnapshot,
    copyShareLink,
    saveProject, loadProject, importNodeFromJson, resetCanvas,
    externalNodes, isRefreshingNodes, refreshExternalNodes, nodesByCategory, fullRegistry,
    projectFileInputRef, nodeImportInputRef,
    pendingShareData, handleShareAction,
    currentScope, enterGroup, exitGroup, navigateToScope, getBreadcrumbs
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
