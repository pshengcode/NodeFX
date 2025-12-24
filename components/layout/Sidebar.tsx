import React, { useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { FileJson, ChevronDown, ChevronRight, Trash2, Download, Upload, Info, X, BookOpen, BookText, Layers, BookmarkPlus } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { ShaderNodeDefinition, NodeCategory, LibraryItem, CanvasTemplate } from '../../types';
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

// Canvas Template Item Component
interface CanvasTemplateItemProps {
    template: CanvasTemplate;
    onLoad: (template: CanvasTemplate) => void;
}

const CanvasTemplateItem: React.FC<CanvasTemplateItemProps> = ({ template, onLoad }) => {
    const { t } = useTranslation();
    const { removeFromLibrary } = useProject();
    
    return (
        <div 
            onClick={() => onLoad(template)}
            className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-cyan-900/30 text-zinc-400 hover:text-cyan-200 transition-all group w-full text-left border border-cyan-900/20 hover:border-cyan-700/50 cursor-pointer relative"
            title={`${template.description || t('Canvas Template')} ${t('(Click to load)')}`}
        >
            <Layers size={14} className="text-cyan-400 opacity-70 group-hover:opacity-100 shrink-0" />
            <div className="flex-1 min-w-0">
                <span className="text-xs font-medium truncate block">{template.label}</span>
                <span className="text-[10px] text-zinc-500 truncate block">{template.nodes.length} {t('nodes')}</span>
            </div>
            <button 
                onClick={(e) => { 
                    e.stopPropagation(); 
                    if(confirm(t("Delete Canvas Template?"))) {
                        removeFromLibrary(template.id); 
                    }
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity shrink-0"
                title={t("Delete from Library")}
            >
                <Trash2 size={12} />
            </button>
        </div>
    );
};

interface SidebarCategoryProps {
    category: string;
    items: LibraryItem[];
    onDragStart: (e: React.DragEvent, id: string) => void;
    onClick: (node: ShaderNodeDefinition) => void;
    onLoadCanvas: (template: CanvasTemplate) => void;
    extraAction?: React.ReactNode;
    topContent?: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
}

const SidebarCategory: React.FC<SidebarCategoryProps> = ({ category, items, onDragStart, onClick, onLoadCanvas, extraAction, topContent, isOpen, onToggle }) => {
    const { t } = useTranslation();

    // Separate nodes and canvas templates
    const nodes = items.filter((item): item is ShaderNodeDefinition => !('itemType' in item));
    const canvasTemplates = items.filter((item): item is CanvasTemplate => 'itemType' in item && item.itemType === 'canvas');

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
                    {/* Top Content (e.g., Save Button) */}
                    {topContent}
                    
                    {/* Canvas Templates First */}
                    {canvasTemplates.length > 0 && (
                        <>
                            {canvasTemplates.map(template => (
                                <CanvasTemplateItem 
                                    key={template.id} 
                                    template={template} 
                                    onLoad={onLoadCanvas}
                                />
                            ))}
                            {nodes.length > 0 && <div className="h-px bg-zinc-800/50 my-1" />}
                        </>
                    )}
                    
                    {/* Regular Nodes */}
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
        nodes,
        setNodes,
        setEdges,
        setPreviewNodeId,
        resolution,
        addCanvasToLibrary
    } = useProject();

    const [expandedCategory, setExpandedCategory] = useState<string | null>('Generator');
    const [showAbout, setShowAbout] = useState(false);
    const [showChangelog, setShowChangelog] = useState(false);
    const [showExampleConfirm, setShowExampleConfirm] = useState(false);
    const [showCanvasLoadConfirm, setShowCanvasLoadConfirm] = useState(false);
    const [showSaveDialog, setShowSaveDialog] = useState(false);
    const [canvasName, setCanvasName] = useState('');
    const [canvasDesc, setCanvasDesc] = useState('');
    const [pendingCanvasTemplate, setPendingCanvasTemplate] = useState<CanvasTemplate | null>(null);
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

    const handleLoadCanvas = useCallback((template: CanvasTemplate) => {
        if (nodes.length > 1 || (nodes.length === 1 && nodes[0].id !== '1')) {
            setPendingCanvasTemplate(template);
            setShowCanvasLoadConfirm(true);
            return;
        }
        loadCanvasTemplateNow(template);
    }, [nodes]);

    const loadCanvasTemplateNow = useCallback((template: CanvasTemplate) => {
        const nodesWithZ = template.nodes.map(n => {
            const w = typeof n.width === 'number' && Number.isFinite(n.width) ? n.width : undefined;
            const h = typeof n.height === 'number' && Number.isFinite(n.height) ? n.height : undefined;

            return {
                ...n,
                zIndex: n.type === 'group' ? -10 : 10,
                data: { ...n.data, resolution },
                // Ensure group node dimensions are honored on restore.
                // ReactFlow relies on node.style for initial sizing in many cases.
                ...(n.type === 'group' && (w !== undefined || h !== undefined)
                    ? {
                        style: {
                            ...(n as any).style,
                            ...(w !== undefined ? { width: w } : {}),
                            ...(h !== undefined ? { height: h } : {})
                        }
                    }
                    : {})
            };
        });

        // Some serialized templates may have edges without explicit handle IDs.
        // compileGraph relies on handle IDs to map connections to input/output ports.
        const nodeById = new Map(nodesWithZ.map(n => [n.id, n] as const));
        const normalizedEdges = (template.edges || []).map(e => {
            const sourceNode = nodeById.get(e.source as any);
            const targetNode = nodeById.get(e.target as any);

            let sourceHandle = (e as any).sourceHandle;
            let targetHandle = (e as any).targetHandle;

            if ((targetHandle == null || targetHandle === '') && targetNode) {
                const inputs = (targetNode as any).data?.inputs || [];
                if (inputs.length === 1) targetHandle = inputs[0].id;
            }

            if ((sourceHandle == null || sourceHandle === '') && sourceNode) {
                const outputs = (sourceNode as any).data?.outputs || [];
                if (outputs.length === 1) sourceHandle = outputs[0].id;
            }

            return {
                ...e,
                sourceHandle: sourceHandle ?? null,
                targetHandle: targetHandle ?? null,
            };
        });

        setNodes(nodesWithZ as any);
        setEdges(normalizedEdges as any);
        
        let previewNode = nodesWithZ.find(n => n.data.preview);
        if (!previewNode && nodesWithZ.length > 0) {
            previewNode = nodesWithZ.find(n => n.id === template.previewNodeId || n.id === '1') || nodesWithZ[0];
        }
        
        setPreviewNodeId(previewNode ? previewNode.id : null);
    }, [resolution, setNodes, setEdges, setPreviewNodeId]);

    const confirmLoadCanvas = useCallback(() => {
        setShowCanvasLoadConfirm(false);
        if (pendingCanvasTemplate) {
            loadCanvasTemplateNow(pendingCanvasTemplate);
            setPendingCanvasTemplate(null);
        }
    }, [pendingCanvasTemplate, loadCanvasTemplateNow]);

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
                    aria-label={t("Load Example Project")}
                >
                    <BookOpen size={14} />
                </button>
                <button
                    onClick={() => window.open('https://doc.node-fx.com/', '_blank', 'noopener,noreferrer')}
                    className="flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 hover:border-zinc-600 transition-all text-xs font-medium"
                    title={t('Open User Guide')}
                    aria-label={t('Open User Guide')}
                >
                    <BookText size={14} />
                </button>
                <button 
                    onClick={() => nodeImportInputRef.current?.click()}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/50 hover:border-zinc-600 transition-all text-xs font-medium"
                    title={t('Import')}
                    aria-label={t('Import')}
                >
                    <FileJson size={14} />
                </button>
            </div>
            
            <div className="w-full h-px bg-zinc-800/50 mb-3 shrink-0 mx-2"></div>

            <div className="flex-1 flex flex-col min-h-0 overflow-hidden px-2 pb-2 gap-2">
                {CATEGORY_ORDER.map(cat => {
                    const groupNodes = nodesByCategory[cat];
                    if (!groupNodes) return null;
                    
                    let extra = null;
                    let topContent = null;
                    
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
                        
                        topContent = (
                            <button
                                onClick={() => setShowSaveDialog(true)}
                                className="flex items-center gap-2 px-2 py-2 mb-1 rounded-md bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-200 border border-cyan-700/50 hover:border-cyan-600 transition-all group w-full"
                                title={t("Save Canvas to Library")}
                            >
                                <BookmarkPlus size={14} className="shrink-0" />
                                <span className="text-xs font-medium">{t("Save Canvas to Library")}</span>
                            </button>
                        );
                    }

                    return (
                        <SidebarCategory 
                            key={cat}
                            category={cat}
                            items={groupNodes}
                            onDragStart={onDragStart}
                            onClick={handleSidebarClick}
                            onLoadCanvas={handleLoadCanvas}
                            extraAction={extra}
                            topContent={topContent}
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
                                {(() => {
                                    const desc = t('About Description');
                                    return desc === 'About Description' ? appConfig.description : desc;
                                })()}
                            </div>

                            <div className="p-3 bg-zinc-800/50 rounded border border-zinc-800">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xs text-zinc-500 uppercase tracking-wider">{t("Created by")}</span>
                                        <span className="font-medium text-white truncate">{appConfig.author}</span>
                                    </div>

                                    <span className="text-zinc-700">•</span>

                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-xs text-zinc-500 uppercase tracking-wider">{t("Contact")}</span>
                                        <a
                                            href={`mailto:${appConfig.email}`}
                                            className="text-blue-400 hover:text-blue-300 transition-colors truncate"
                                        >
                                            {appConfig.email}
                                        </a>
                                    </div>

                                    {appConfig.github && (
                                        <>
                                            <span className="text-zinc-700">•</span>
                                            <a
                                                href={appConfig.github}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-zinc-400 hover:text-white transition-colors text-xs"
                                            >
                                                GitHub
                                            </a>
                                        </>
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

            {showCanvasLoadConfirm && createPortal(
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto" onClick={() => {
                    setShowCanvasLoadConfirm(false);
                    setPendingCanvasTemplate(null);
                }}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6 max-w-sm w-full relative" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                            <Layers size={18} className="text-cyan-400" />
                            {t("Load Canvas Template")}
                        </h2>
                        <p className="text-zinc-400 text-sm mb-2">{t("This will replace your current canvas with:")}</p>
                        {pendingCanvasTemplate && (
                            <div className="bg-zinc-800/50 rounded p-3 mb-6 border border-zinc-700/50">
                                <div className="font-medium text-white">{pendingCanvasTemplate.label}</div>
                                <div className="text-xs text-zinc-400 mt-1">{pendingCanvasTemplate.nodes.length} {t('nodes')}</div>
                                {pendingCanvasTemplate.description && (
                                    <div className="text-xs text-zinc-500 mt-2">{pendingCanvasTemplate.description}</div>
                                )}
                            </div>
                        )}
                        <p className="text-zinc-400 text-sm mb-6">{t("Continue?")}</p>
                        <div className="flex justify-end gap-2">
                            <button 
                                onClick={() => {
                                    setShowCanvasLoadConfirm(false);
                                    setPendingCanvasTemplate(null);
                                }}
                                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                            >
                                {t("Cancel")}
                            </button>
                            <button 
                                onClick={confirmLoadCanvas}
                                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-sm transition-colors"
                            >
                                {t("Load")}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showSaveDialog && createPortal(
                <div 
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm pointer-events-auto" 
                    onClick={() => {
                        setShowSaveDialog(false);
                        setCanvasName('');
                        setCanvasDesc('');
                    }}
                >
                    <div 
                        className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-6 max-w-md w-full relative" 
                        onClick={e => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold text-white mb-4">{t("Save Canvas to Library")}</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-zinc-400 mb-1">{t("Canvas Name")}</label>
                                <input 
                                    type="text"
                                    value={canvasName}
                                    onChange={e => setCanvasName(e.target.value)}
                                    placeholder={t("Enter canvas name...")}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500"
                                    autoFocus
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm text-zinc-400 mb-1">{t("Description")} ({t("Optional")})</label>
                                <textarea 
                                    value={canvasDesc}
                                    onChange={e => setCanvasDesc(e.target.value)}
                                    placeholder={t("Enter description...")}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white text-sm focus:outline-none focus:border-cyan-500 resize-none"
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 mt-6">
                            <button 
                                onClick={() => {
                                    setShowSaveDialog(false);
                                    setCanvasName('');
                                    setCanvasDesc('');
                                }}
                                className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm transition-colors"
                            >
                                {t("Cancel")}
                            </button>
                            <button 
                                onClick={() => {
                                    if (canvasName.trim()) {
                                        addCanvasToLibrary(canvasName.trim(), canvasDesc.trim() || undefined);
                                        setShowSaveDialog(false);
                                        setCanvasName('');
                                        setCanvasDesc('');
                                        alert(t("Canvas saved to library!"));
                                    }
                                }}
                                disabled={!canvasName.trim()}
                                className={`px-4 py-2 rounded text-white text-sm transition-colors ${
                                    canvasName.trim() 
                                        ? 'bg-cyan-600 hover:bg-cyan-500' 
                                        : 'bg-zinc-700 cursor-not-allowed'
                                }`}
                            >
                                {t("Save")}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
