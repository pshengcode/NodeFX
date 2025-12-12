import React, { useState, useCallback, useEffect, memo, useMemo, lazy } from 'react';
import ReactFlow, { 
    Background, Controls, SelectionMode, NodeTypes, EdgeTypes
} from 'reactflow';
import { Eye, ChevronRight, Home } from 'lucide-react';
import { useProject, useProjectDispatch } from '../../context/ProjectContext';
import GroupNode from '../GroupNode';
import NetworkNode from '../NetworkNode';
import PaintNode from '../PaintNode';
import BakeNode from '../BakeNode';
import SmartEdge from '../SmartEdge';
import ContextMenu from '../ContextMenu';
import ShaderPreview from '../ShaderPreview';
import { GraphInputNode, GraphOutputNode } from '../IOProxyNodes';
import { useTranslation } from 'react-i18next';

// Lazy load large components for code splitting
const CustomNode = lazy(() => import('../CustomNode'));
const ParticleSystemNode = lazy(() => import('../ParticleSystemNode'));
const FluidSimulationNode = lazy(() => import('../FluidSimulationNode'));

// Define nodeTypes OUTSIDE component to prevent re-creation on every render
// This is critical for performance - if nodeTypes object changes, ReactFlow re-renders ALL nodes
const nodeTypes: NodeTypes = {
  customShader: CustomNode,
  group: GroupNode,
  particleSystem: ParticleSystemNode,
  networkNode: NetworkNode, 
  paintNode: PaintNode,
  fluidSimulationNode: FluidSimulationNode,
  bakeNode: BakeNode,
  graphInput: GraphInputNode,
  graphOutput: GraphOutputNode
};

const edgeTypes: EdgeTypes = {
  smart: SmartEdge
};

const PerformanceMonitor = ({ nodeCount }: { nodeCount: number }) => {
    const [fps, setFps] = useState(0);
    const [avgFrameTime, setAvgFrameTime] = useState(0);

    useEffect(() => {
        let frameCount = 0;
        let lastTime = performance.now();
        let animationFrameId: number;

        const loop = () => {
            const now = performance.now();
            frameCount++;
            
            if (now - lastTime >= 1000) {
                setFps(frameCount);
                setAvgFrameTime(1000 / frameCount);
                frameCount = 0;
                lastTime = now;
            }
            
            animationFrameId = requestAnimationFrame(loop);
        };

        loop();
        return () => cancelAnimationFrame(animationFrameId);
    }, []);

    return (
        <div className="absolute top-20 right-4 z-50 bg-black/60 backdrop-blur-md border border-zinc-700 p-2 rounded text-xs font-mono text-zinc-300 pointer-events-none select-none">
            <div className="font-bold text-zinc-400 mb-1 border-b border-zinc-700 pb-1">DEV STATS</div>
            <div className="flex justify-between gap-4"><span>Nodes:</span> <span className="text-white">{nodeCount}</span></div>
            <div className="flex justify-between gap-4"><span>FPS:</span> <span className={fps < 30 ? "text-red-500" : "text-green-500"}>{fps}</span></div>
            <div className="flex justify-between gap-4"><span>Frame:</span> <span>{avgFrameTime.toFixed(1)}ms</span></div>
        </div>
    );
};

// Memoized Breadcrumbs Component
const Breadcrumbs = memo(({ breadcrumbs, currentScope, onNavigate }: {
    breadcrumbs: Array<{ id: string; label: string }>;
    currentScope: string;
    onNavigate: (id: string) => void;
}) => {
    return (
        <div className="absolute top-20 left-4 z-10 flex items-center bg-zinc-900/80 backdrop-blur-md rounded-lg px-3 py-2 border border-zinc-700 shadow-lg">
            {breadcrumbs.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                    {index > 0 && <ChevronRight size={14} className="text-zinc-600 mx-1" />}
                    <button 
                        onClick={() => onNavigate(crumb.id)}
                        className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                            crumb.id === currentScope 
                            ? 'text-zinc-200 font-bold bg-zinc-700/50 cursor-default' 
                            : 'text-zinc-400 hover:text-blue-400 hover:bg-zinc-700/30'
                        }`}
                        disabled={crumb.id === currentScope}
                    >
                        {crumb.id === 'root' && <Home size={12} className="mb-0.5" />}
                        {crumb.label}
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
});

// Memoized Preview Panel Component
const PreviewPanel = memo(({ 
    compiledData, 
    resolution, 
    previewNodeId, 
    onNodeError,
    t 
}: {
    compiledData: any;
    resolution: { w: number; h: number };
    previewNodeId: string | null;
    onNodeError: (nodeId: string, error: string | null) => void;
    t: (key: string) => string;
}) => {
    return (
        <div className="absolute bottom-6 right-6 w-[400px] aspect-square bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl z-[200] flex flex-col pointer-events-auto">
            <div className="h-8 bg-zinc-800 border-b border-zinc-700 flex items-center px-3 justify-between">
                <span className="text-xs font-medium text-zinc-400 flex items-center gap-2">
                    <Eye size={12} className="text-green-500"/> {t("Live Preview")}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                    {previewNodeId ? `${resolution.w}x${resolution.h}` : t('No Selection')}
                </span>
            </div>
            <div className="flex-1 relative bg-black">
                <ShaderPreview 
                    data={compiledData} 
                    width={resolution.w} 
                    height={resolution.h} 
                    className="w-full h-full"
                    onNodeError={onNodeError}
                />
            </div>
        </div>
    );
}, (prev, next) => {
    return (
        prev.compiledData === next.compiledData &&
        prev.resolution.w === next.resolution.w &&
        prev.resolution.h === next.resolution.h &&
        prev.previewNodeId === next.previewNodeId
    );
});

export const Canvas: React.FC = () => {
    const { t } = useTranslation();
    
    // Use dispatch context instead of full context where possible
    const { 
        onNodesChange, onEdgesChange, onConnect, 
        onNodeClick, onNodeDragStart, onNodeDragStop, onNodesDelete, 
        setReactFlowInstance, onDrop, onDragOver, 
        reactFlowWrapper, addNode, nodeRegistryList,
        compiledData, resolution, previewNodeId, setNodes,
        reactFlowInstance, getBreadcrumbs, navigateToScope, currentScope
    } = useProjectDispatch();
    
    // Get nodes and edges from full context (these trigger re-renders)
    const { nodes, edges } = useProject();

    const [menuState, setMenuState] = useState<{ visible: boolean; x: number; y: number; flowPosition?: {x: number, y: number} } | null>(null);
    
    // Memoize breadcrumbs to avoid recalculation
    // Don't depend on nodes - breadcrumbs only change when scope or structure changes
    const breadcrumbs = useMemo(() => getBreadcrumbs(), [getBreadcrumbs, currentScope]);

    const onContextMenuWithInstance = useCallback(
        (event: React.MouseEvent) => {
            event.preventDefault();
            if(!reactFlowWrapper.current || !reactFlowInstance) return;
            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const flowPosition = reactFlowInstance.project({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            });
            setMenuState({
                visible: true,
                x: event.clientX,
                y: event.clientY,
                flowPosition
            });
        },
        [reactFlowInstance, reactFlowWrapper]
    );

    const closeContextMenu = useCallback(() => setMenuState(null), []);

    const handleNodeError = useCallback((nodeId: string, error: string | null) => {
        setNodes((nds) => {
            let needsUpdate = false;
            const newNodes = nds.map((n) => {
                if (nodeId === "CLEAR_ALL") {
                    if (n.data.executionError !== undefined) {
                        needsUpdate = true;
                        return { ...n, data: { ...n.data, executionError: undefined } };
                    }
                    return n;
                }
                const cleanId = n.id.replace(/-/g, '_');
                if (n.id === nodeId || cleanId === nodeId) {
                    const newError = error || undefined;
                    if (n.data.executionError !== newError) {
                        needsUpdate = true;
                        return { ...n, data: { ...n.data, executionError: newError } };
                    }
                }
                return n;
            });
            return needsUpdate ? newNodes : nds;
        });
    }, [setNodes]);

    return (
        <div className="flex-1 relative flex flex-col h-full" ref={reactFlowWrapper} onClick={closeContextMenu}>
            <div className="flex-1 relative">
                <React.Suspense fallback={<div className="flex items-center justify-center h-full text-white">Loading...</div>}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    onNodeDragStart={onNodeDragStart}
                    onNodeDragStop={onNodeDragStop}
                    onNodesDelete={onNodesDelete}
                    onInit={setReactFlowInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onContextMenu={onContextMenuWithInstance}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    fitView
                    className="bg-zinc-950"
                    minZoom={0.2}
                    panOnScroll={false} 
                    zoomOnScroll={true} 
                    panOnDrag={[1]}     
                    selectionOnDrag={true} 
                    selectionMode={SelectionMode.Partial} 
                    elevateNodesOnSelect={false} 
                    proOptions={{ hideAttribution: true }} 
                    deleteKeyCode={['Backspace', 'Delete']}
                    nodeDragThreshold={10}
                >
                    <Background color="#202022ff" gap={40} size={2} />
                    <Controls className="!bg-zinc-800 !border-zinc-700 !fill-zinc-400" />
                    {menuState?.visible && (
                        <ContextMenu 
                            x={menuState.x} 
                            y={menuState.y} 
                            onClose={closeContextMenu}
                            onAddNode={(def) => {
                                if(menuState.flowPosition) {
                                    addNode(def, menuState.flowPosition);
                                }
                            }}
                            registry={nodeRegistryList} 
                        />
                    )}
                </ReactFlow>
                </React.Suspense>
                
                {/* Breadcrumbs Overlay */}
                <Breadcrumbs 
                    breadcrumbs={breadcrumbs} 
                    currentScope={currentScope} 
                    onNavigate={navigateToScope}
                />

                 {/* Dev Performance Monitor */}
                 {import.meta.env.DEV && <PerformanceMonitor nodeCount={nodes.length} />}
            </div>

            {/* Preview Panel */}
            <PreviewPanel 
                compiledData={compiledData}
                resolution={resolution}
                previewNodeId={previewNodeId}
                onNodeError={handleNodeError}
                t={t}
            />
        </div>
    );
};
