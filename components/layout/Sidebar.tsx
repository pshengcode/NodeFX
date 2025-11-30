import React, { useCallback, useState } from 'react';
import { FileJson, ChevronDown, ChevronRight } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { ShaderNodeDefinition, NodeCategory } from '../../types';
import { useNodeTranslation } from '../../hooks/useNodeTranslation';
import { useTranslation } from 'react-i18next';

interface SidebarItemProps {
    node: ShaderNodeDefinition;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (node: ShaderNodeDefinition) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ node, onDragStart, onClick }) => {
    const tNode = useNodeTranslation(node);
    const { t } = useTranslation();
    
    return (
          <div 
              draggable
              onDragStart={(event) => onDragStart(event, node.id)}
              onClick={() => onClick(node)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all group w-full text-left border border-transparent hover:border-zinc-700/50 cursor-grab active:cursor-grabbing"
              title={`${tNode(node.description || '')} ${t('(Click to add)')}`}
          >
              <span className="text-xs font-medium truncate pointer-events-none">{tNode(node.label)}</span>
          </div>
    );
};

interface SidebarCategoryProps {
    category: string;
    nodes: ShaderNodeDefinition[];
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (node: ShaderNodeDefinition) => void;
}

const SidebarCategory: React.FC<SidebarCategoryProps> = ({ category, nodes, onDragStart, onClick }) => {
    const [isOpen, setIsOpen] = useState(true);
    const { t } = useTranslation();

    return (
        <div className="flex flex-col w-full mb-2">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-bold text-zinc-200 uppercase tracking-wider hover:text-white hover:bg-zinc-800/50 rounded transition-colors select-none group"
            >
                <span className="group-hover:text-white transition-colors">{t(category) || category}</span>
                {isOpen ? <ChevronDown size={12} className="opacity-50 group-hover:opacity-100"/> : <ChevronRight size={12} className="opacity-50 group-hover:opacity-100"/>}
            </button>
            
            {isOpen && (
                <div className="flex flex-col gap-0.5 mt-0.5 pl-1">
                    {nodes.map(node => (
                        <SidebarItem 
                            key={node.id} 
                            node={node} 
                            onDragStart={onDragStart} 
                            onClick={onClick} 
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const CATEGORY_ORDER: NodeCategory[] = ['Source', 'Filter', 'Math', 'Custom', 'Network', 'Output'];

export const Sidebar: React.FC = () => {
    const { t } = useTranslation();
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
            <div className="px-4 mb-6 flex items-center justify-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center relative shadow-xl group overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-50" />
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 transform group-hover:scale-110 transition-transform duration-500">
                        <path d="M5 16.5C11 18.5 13 4.5 19 2.5L19 7.5C13 5.5 11 19.5 5 21.5Z" fill="#52525b"/>
                        <circle cx="5" cy="19" r="3.5" fill="#e4e4e7"/>
                        <circle cx="19" cy="5" r="3.5" fill="#22d3ee" className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"/>
                    </svg>
                </div>
                <h2 className="font-bold text-zinc-100 leading-none text-xl tracking-wide">NodeFX</h2>
            </div>

            <div className="px-2 mb-4 flex gap-1 shrink-0">
                <input type="file" ref={nodeImportInputRef} onChange={importNodeFromJson} className="hidden" accept=".json" />
                <button 
                    onClick={() => nodeImportInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 hover:border-zinc-600 transition-all text-xs font-medium"
                >
                    <FileJson size={14} /> {t('Import')}
                </button>
            </div>
            
            <div className="w-full h-px bg-zinc-800/50 mb-3 shrink-0 mx-2"></div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4">
                {CATEGORY_ORDER.map(cat => {
                    const groupNodes = nodesByCategory[cat];
                    if (!groupNodes) return null;
                    return (
                        <SidebarCategory 
                            key={cat}
                            category={cat}
                            nodes={groupNodes}
                            onDragStart={onDragStart}
                            onClick={handleSidebarClick}
                        />
                    );
                })}
            </div>
        </div>
    );
};
