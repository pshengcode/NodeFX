import React, { useCallback } from 'react';
import { FileJson } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { ShaderNodeDefinition, NodeCategory } from '../../types';
import { useNodeTranslation } from '../../hooks/useNodeTranslation';

interface SidebarItemProps {
    node: ShaderNodeDefinition;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (node: ShaderNodeDefinition) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ node, onDragStart, onClick }) => {
    const t = useNodeTranslation(node);
    
    return (
          <div 
              draggable
              onDragStart={(event) => onDragStart(event, node.id)}
              onClick={() => onClick(node)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all group w-full text-left border border-transparent hover:border-zinc-700/50 cursor-grab active:cursor-grabbing"
              title={`${t(node.description || '')} (Click to add)`}
          >
              <span className="text-xs font-medium truncate pointer-events-none">{t(node.label)}</span>
          </div>
    );
};

const CATEGORY_ORDER: NodeCategory[] = ['Source', 'Filter', 'Math', 'Custom', 'Network', 'Output'];

export const Sidebar: React.FC = () => {
    const { 
        nodesByCategory, 
        addNode, 
        reactFlowInstance, 
        reactFlowWrapper, 
        importNodeFromJson, 
        nodeImportInputRef 
    } = useProject();

    const handleSidebarClick = useCallback((def: ShaderNodeDefinition) => {
        if (!reactFlowInstance || !reactFlowWrapper.current) return;
  
        const { x, y, zoom } = reactFlowInstance.getViewport();
        const { width, height } = reactFlowWrapper.current.getBoundingClientRect();
  
        const centerX = (-x + width / 2) / zoom;
        const centerY = (-y + height / 2) / zoom;
  
        const position = {
            x: centerX - 100 + (Math.random() * 40 - 20), 
            y: centerY - 50 + (Math.random() * 40 - 20)
        };
        
        addNode(def, position);
    }, [reactFlowInstance, reactFlowWrapper, addNode]);

    const onDragStart = (event: React.DragEvent, nodeId: string) => {
        event.dataTransfer.setData('application/reactflow', nodeId);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div className="w-64 flex flex-col py-4 bg-zinc-900 border-r border-zinc-800 z-20 shadow-lg h-full">
            <div className="px-4 mb-6 flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 via-cyan-400 to-pink-500 shadow-lg shadow-cyan-500/20 shrink-0"></div>
                <div>
                    <h2 className="font-bold text-zinc-100 leading-none text-xl tracking-wide">GLSL</h2>
                </div>
            </div>

            <div className="px-2 mb-4 flex gap-1 shrink-0">
                <input type="file" ref={nodeImportInputRef} onChange={importNodeFromJson} className="hidden" accept=".json" />
                <button 
                    onClick={() => nodeImportInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 hover:border-zinc-600 transition-all text-xs font-medium"
                >
                    <FileJson size={14} /> Import
                </button>
            </div>
            
            <div className="w-full h-px bg-zinc-800/50 mb-3 shrink-0 mx-2"></div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
                {CATEGORY_ORDER.map(cat => {
                    const groupNodes = nodesByCategory[cat];
                    if (!groupNodes) return null;
                    return (
                        <div key={cat} className="flex flex-col w-full mb-3">
                            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1 px-2 opacity-80">{cat}</div>
                            <div className="flex flex-col gap-0.5">
                                {groupNodes.map(node => (
                                    <SidebarItem 
                                        key={node.id} 
                                        node={node} 
                                        onDragStart={onDragStart} 
                                        onClick={handleSidebarClick} 
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
