import React, { useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileJson, ChevronDown, ChevronRight, Trash2, Download, Upload, Info, X, BookOpen } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { ShaderNodeDefinition, NodeCategory } from '../../types';
import { useNodeTranslation } from '../../hooks/useNodeTranslation';
import { useTranslation } from 'react-i18next';
import appConfig from '../../appConfig.json';
// @ts-ignore
import changelogContent from '../../CHANGELOG.md?raw';

interface SidebarItemProps {
    node: ShaderNodeDefinition;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (node: ShaderNodeDefinition) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ node, onDragStart, onClick }) => {
    const tNode = useNodeTranslation(node);
    const { t } = useTranslation();
    const { removeFromLibrary } = useProject();
    
    const isUserNode = node.category === 'User';
    
    return (
          <div 
              draggable
              onDragStart={(event) => onDragStart(event, node.id)}
              onClick={() => onClick(node)}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-all group w-full text-left border border-transparent hover:border-zinc-700/50 cursor-grab active:cursor-grabbing relative"
              title={`${tNode(node.description || '')} ${t('(Click to add)')}`}
          >
              <span className="text-xs font-medium truncate pointer-events-none flex-1">{tNode(node.label)}</span>
              {isUserNode && (
                  <button 
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if(confirm(t("Delete from Library?"))) {
                            removeFromLibrary(node.id); 
                        }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                    title={t("Delete from Library")}
                  >
                      <Trash2 size={12} />
                  </button>
              )}
          </div>
    );
};

interface SidebarCategoryProps {
    category: string;
    nodes: ShaderNodeDefinition[];
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (node: ShaderNodeDefinition) => void;
    extraAction?: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
}

const SidebarCategory: React.FC<SidebarCategoryProps> = ({ category, nodes, onDragStart, onClick, extraAction, isOpen, onToggle }) => {
    const { t } = useTranslation();

    return (
        <div className={`flex flex-col w-full transition-all duration-300 ${isOpen ? 'flex-1 min-h-0' : 'shrink-0'}`}>
            <div className="flex-none sticky top-0 z-10 flex items-center justify-between w-full px-2 py-1.5 rounded bg-zinc-900/95 backdrop-blur-sm border border-zinc-800/50 hover:bg-zinc-800 transition-colors group shadow-sm">
                <button 
                    onClick={onToggle}
                    className="flex items-center gap-2 flex-1 text-xs font-bold text-zinc-200 uppercase tracking-wider hover:text-white select-none text-left"
                >
                    {isOpen ? <ChevronDown size={12} className="opacity-50 group-hover:opacity-100"/> : <ChevronRight size={12} className="opacity-50 group-hover:opacity-100"/>}
                    <span className="group-hover:text-white transition-colors">{t(category) || category}</span>
                </button>
                {extraAction}
            </div>
            
            {isOpen && (
                <div className="flex-1 overflow-y-auto custom-scrollbar pl-1 mt-0.5 flex flex-col gap-0.5 min-h-0">
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

const CATEGORY_ORDER: NodeCategory[] = [
    'User', 
    'Input', 
    'Generator', 
    'Math', 
    'Vector', 
    'Color', 
    'Filter', 
    'Effect', 
    'Utility', 
    'Network', 
    'Custom', 
    'Output'
];

export const Sidebar: React.FC = () => {
    const { t } = useTranslation();
    const { 
        nodesByCategory, 
        addNode, 
        reactFlowInstance, 
        reactFlowWrapper, 
        importNodeFromJson, 
        nodeImportInputRef,
        exportLibrary,
        importLibrary,
        loadExampleProject,
        nodes
    } = useProject();

    const [expandedCategory, setExpandedCategory] = useState<string | null>('Generator');
    const [showAbout, setShowAbout] = useState(false);
    const [showChangelog, setShowChangelog] = useState(false);
    const [showExampleConfirm, setShowExampleConfirm] = useState(false);
    const libraryImportRef = useRef<HTMLInputElement>(null);

    const handleLoadExample = async () => {
        if (nodes.length > 1 || (nodes.length === 1 && nodes[0].id !== '1')) {
            setShowExampleConfirm(true);
            return;
        }
        const success = await loadExampleProject();
        if (!success) {
            alert(t("Example project not found."));
        }
    };

    const confirmLoadExample = async () => {
        setShowExampleConfirm(false);
        const success = await loadExampleProject();
        if (!success) {
            alert(t("Example project not found."));
        }
    };

    const handleLibraryImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            if (content) {
                if (importLibrary(content)) {
                    alert(t("Library imported successfully!"));
                } else {
                    alert(t("Failed to import library. Invalid format."));
                }
            }
        };
        reader.readAsText(file);
        // Reset input
        e.target.value = '';
    };

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
                <div className="flex items-center gap-2">
                    <h2 className="font-bold text-zinc-100 leading-none text-xl tracking-wide">NodeFX</h2>
                    <button 
                        onClick={() => setShowAbout(true)}
                        className="text-zinc-600 hover:text-zinc-300 transition-colors"
                        title={t("About")}
                    >
                        <Info size={14} />
                    </button>
                </div>
            </div>

            <div className="px-2 mb-4 flex gap-1 shrink-0">
                <input type="file" ref={nodeImportInputRef} onChange={importNodeFromJson} className="hidden" accept=".nodefx,.json" />
                <input type="file" ref={libraryImportRef} onChange={handleLibraryImport} className="hidden" accept=".json" />
                <button 
                    onClick={handleLoadExample}
                    className="flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 hover:border-zinc-600 transition-all text-xs font-medium"
                    title={t("Load Example Project")}
                >
                    <BookOpen size={14} /> {t('Example')}
                </button>
                <button 
                    onClick={() => nodeImportInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 hover:border-zinc-600 transition-all text-xs font-medium"
                >
                    <FileJson size={14} /> {t('Import')}
                </button>
            </div>
            
            <div className="w-full h-px bg-zinc-800/50 mb-3 shrink-0 mx-2"></div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-2 pb-2 gap-2">
                {CATEGORY_ORDER.map(cat => {
                    const groupNodes = nodesByCategory[cat];
                    if (!groupNodes) return null;
                    
                    let extra = null;
                    if (cat === 'User') {
                        extra = (
                            <div className="flex gap-1 mr-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                <button 
                                    onClick={() => exportLibrary()} 
                                    title={t("Export Library")} 
                                    className="p-1 text-zinc-500 hover:text-blue-400 hover:bg-zinc-700 rounded transition-colors"
                                >
                                    <Download size={12}/>
                                </button>
                                <button 
                                    onClick={() => libraryImportRef.current?.click()} 
                                    title={t("Import Library")} 
                                    className="p-1 text-zinc-500 hover:text-green-400 hover:bg-zinc-700 rounded transition-colors"
                                >
                                    <Upload size={12}/>
                                </button>
                            </div>
                        );
                    }

                    return (
                        <SidebarCategory 
                            key={cat}
                            category={cat}
                            nodes={groupNodes}
                            onDragStart={onDragStart}
                            onClick={handleSidebarClick}
                            extraAction={extra}
                            isOpen={expandedCategory === cat}
                            onToggle={() => setExpandedCategory(prev => prev === cat ? null : cat)}
                        />
                    );
                })}
            </div>

            {showAbout && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => setShowAbout(false)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6 max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowAbout(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
                            <X size={16} />
                        </button>
                        
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Info size={20} className="text-blue-500"/>
                            {t("About")}
                        </h2>
                        
                        <div className="space-y-4 text-zinc-300 text-sm">
                            <div className="text-sm text-zinc-400 italic">
                                {appConfig.description}
                            </div>

                            <div className="p-3 bg-zinc-800/50 rounded border border-zinc-800">
                                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t("Created by")}</div>
                                <div className="font-medium text-white">{appConfig.author}</div>
                            </div>
                            
                            <div className="p-3 bg-zinc-800/50 rounded border border-zinc-800">
                                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">{t("Contact")}</div>
                                <a href={`mailto:${appConfig.email}`} className="text-blue-400 hover:text-blue-300 transition-colors block mb-1">
                                    {appConfig.email}
                                </a>
                                <div className="flex gap-4 mt-2 pt-2 border-t border-zinc-700/50 items-center justify-between">
                                    {appConfig.github && (
                                        <a href={appConfig.github} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-white transition-colors text-xs flex items-center gap-1">
                                            GitHub
                                        </a>
                                    )}
                                </div>
                            </div>

                            <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-800 flex justify-between items-center">
                                <span>{appConfig.appName}</span>
                                <button 
                                    onClick={() => setShowChangelog(true)}
                                    className="text-blue-500 hover:text-blue-400 transition-colors cursor-pointer font-medium"
                                    title={t("Click to view changelog")}
                                >
                                    {t("Version")} {appConfig.version}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showChangelog && createPortal(
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => setShowChangelog(false)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] flex flex-col relative" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setShowChangelog(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-white">
                            <X size={16} />
                        </button>
                        
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 shrink-0">
                            {t("Changelog")}
                        </h2>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-zinc-950/50 rounded p-4 border border-zinc-800">
                            <pre className="text-zinc-300 text-sm font-mono whitespace-pre-wrap font-sans">
                                {changelogContent}
                            </pre>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showExampleConfirm && createPortal(
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => setShowExampleConfirm(false)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6 max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-white mb-2">{t("Load Example Project")}</h2>
                        <p className="text-zinc-400 text-sm mb-6">{t("This will overwrite your current project. Continue?")}</p>
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={() => setShowExampleConfirm(false)}
                                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                            >
                                {t("Cancel")}
                            </button>
                            <button 
                                onClick={confirmLoadExample}
                                className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm transition-colors"
                            >
                                {t("Confirm")}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
