import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, { 
    Background, Controls, SelectionMode, NodeTypes, EdgeTypes
} from 'reactflow';
import { Eye, ChevronRight, Home } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import CustomNode from '../CustomNode';
import GroupNode from '../GroupNode';
import NetworkNode from '../NetworkNode';
import PaintNode from '../PaintNode';
import SmartEdge from '../SmartEdge';
import ContextMenu from '../ContextMenu';
import ShaderPreview from '../ShaderPreview';
import { GraphInputNode, GraphOutputNode } from '../IOProxyNodes';
import { useTranslation } from 'react-i18next';

const nodeTypes: NodeTypes = {
  customShader: CustomNode,
  group: GroupNode,
  networkNode: NetworkNode, 
  paintNode: PaintNode,
  graphInput: GraphInputNode,
  graphOutput: GraphOutputNode
};

const edgeTypes: EdgeTypes = {
  smart: SmartEdge
};

export const Canvas: React.FC = () => {
    const { t } = useTranslation();
    const { 
        nodes, edges, onNodesChange, onEdgesChange, onConnect, 
        onNodeClick, onNodeDragStop, onNodesDelete, 
        setReactFlowInstance, onDrop, onDragOver, 
        reactFlowWrapper, addNode, fullRegistry, nodeRegistryList,
        compiledData, resolution, previewNodeId, setNodes, setPreviewNodeId,
        reactFlowInstance, getBreadcrumbs, navigateToScope, currentScope
    } = useProject();

    const [menuState, setMenuState] = useState<{ visible: boolean; x: number; y: number; flowPosition?: {x: number, y: number} } | null>(null);
    const breadcrumbs = getBreadcrumbs();

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

    // Preview Node Effect (Sync preview state)
    useEffect(() => {
        setNodes((nds) => 
            nds.map((n) => {
                const isPreview = n.id === previewNodeId;
                if (n.data.preview !== isPreview) {
                    return { ...n, data: { ...n.data, preview: isPreview } };
                }
                return n;
            })
        );
    }, [previewNodeId, setNodes]);

    return (
        <div className="flex-1 relative flex flex-col h-full" ref={reactFlowWrapper} onClick={closeContextMenu}>
            <div className="flex-1 relative">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
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
                
                {/* Breadcrumbs Overlay - Positioned below the absolute Toolbar (h-14 = 3.5rem) */}
                <div className="absolute top-20 left-4 z-10 flex items-center bg-zinc-900/80 backdrop-blur-md rounded-lg px-3 py-2 border border-zinc-700 shadow-lg">
                    {breadcrumbs.map((crumb, index) => (
                        <React.Fragment key={crumb.id}>
                            {index > 0 && <ChevronRight size={14} className="text-zinc-600 mx-1" />}
                            <button 
                                onClick={() => navigateToScope(crumb.id)}
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
            </div>

            {/* Preview Panel */}
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
                        onNodeError={handleNodeError}
                    />
                </div>
            </div>
        </div>
    );
};
