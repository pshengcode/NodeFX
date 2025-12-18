
import React, { memo, useState, useCallback, useEffect } from 'react';
import { NodeProps, NodeResizer, useViewport } from 'reactflow';
import { NodeData } from '../types';
import { useTranslation } from 'react-i18next';
import { useProjectDispatch } from '../context/ProjectContext';

const GroupNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { t } = useTranslation();
  const { zoom } = useViewport();
  const { setNodes } = useProjectDispatch();

  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [isHoveringTitle, setIsHoveringTitle] = useState(false);
  
  const [label, setLabel] = useState(data.label || t('Group'));
  const [description, setDescription] = useState(data.description || '');

  // Sync with data changes (e.g. undo/redo)
  useEffect(() => {
    setLabel(data.label || t('Group'));
    setDescription(data.description || '');
  }, [data.label, data.description, t]);

  const commitChanges = useCallback((newLabel: string, newDesc: string) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id === id) {
        return {
          ...n,
          data: {
            ...n.data,
            label: newLabel,
            description: newDesc
          }
        };
      }
      return n;
    }));
  }, [id, setNodes]);

  const onLabelBlur = () => {
      setIsEditingLabel(false);
      commitChanges(label, description);
  };

  const onDescBlur = () => {
      setIsEditingDesc(false);
      commitChanges(label, description);
  };

  const onResizeEnd = useCallback((_event: any, params: { x: number; y: number; width: number; height: number }) => {
    const { x, y, width, height } = params;

    setNodes((currentNodes) => {
      let hasChanges = false;
      const newNodes = currentNodes.map((n) => {
        if (n.id === id) return n; // Skip self
        if (n.parentId === id) return n; // Skip existing children

        // Check intersection
        const nW = n.width ?? 150;
        const nH = n.height ?? 40;
        const nAbsX = n.positionAbsolute?.x ?? n.position.x;
        const nAbsY = n.positionAbsolute?.y ?? n.position.y;
        const nCenterX = nAbsX + nW / 2;
        const nCenterY = nAbsY + nH / 2;

        if (
          nCenterX >= x &&
          nCenterX <= x + width &&
          nCenterY >= y &&
          nCenterY <= y + height
        ) {
          hasChanges = true;
          return {
            ...n,
            parentId: id,
            position: {
              x: nAbsX - x,
              y: nAbsY - y,
            },
            extent: undefined,
          };
        }
        return n;
      });

      return hasChanges ? newNodes : currentNodes;
    });
  }, [id, setNodes]);

  return (
    <>
      <NodeResizer 
        minWidth={100} 
        minHeight={100} 
        isVisible={selected} 
        lineStyle={{ border: '1px solid #3b82f6', opacity: 0.5 }} 
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }}
        onResizeEnd={onResizeEnd}
      />
      
      {/* Title - Outside Above, Fixed Scale */}
      <div 
        className="absolute left-0"
        style={{
            bottom: '100%',
            transformOrigin: 'bottom left',
            transform: `scale(${(1 / zoom).toFixed(5)}) translate(0, -8px)`,
            width: 'max-content',
        }}
        onMouseEnter={() => setIsHoveringTitle(true)}
        onMouseLeave={() => setIsHoveringTitle(false)}
      >
         {isEditingLabel ? (
             <input 
                className="bg-transparent text-2xl font-bold text-zinc-200 outline-none w-full border-b border-blue-500/50"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => { e.stopPropagation(); if(e.key === 'Enter') onLabelBlur(); }}
                onBlur={onLabelBlur}
                autoFocus
                style={{ fontSize: '24px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
             />
         ) : (
            <div 
                onDoubleClick={() => setIsEditingLabel(true)} 
                className="text-2xl font-bold text-zinc-400 hover:text-zinc-200 transition-colors cursor-text select-none truncate"
                style={{ fontSize: '24px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
            >
                {label}
            </div>
         )}
      </div>

      {/* Main Box */}
      <div className={`relative w-full h-full rounded transition-all duration-300 ${selected ? 'bg-zinc-800/20 ring-1 ring-blue-500/30' : 'bg-zinc-900/20'}`}>
        
        {/* Description - Inside */}
        <div className="absolute top-2 left-2 right-2">
             {isEditingDesc ? (
                 <textarea 
                    className="bg-zinc-800/80 text-sm text-zinc-300 p-2 rounded border border-blue-500/40 outline-none w-full resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    onKeyDown={(e) => { 
                        e.stopPropagation(); 
                        // Allow Enter for new line, Ctrl+Enter to save
                        if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            onDescBlur(); 
                        }
                    }}
                    onBlur={onDescBlur}
                    placeholder={t("Add description...")}
                    autoFocus
                    rows={3}
                />
             ) : (
                <div 
                    onDoubleClick={() => setIsEditingDesc(true)} 
                    className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors cursor-text select-none p-1 min-h-[20px] whitespace-pre-wrap text-left"
                >
                    {description || (isHoveringTitle && <span className="italic opacity-50">{t("Double click to add description")}</span>)}
                </div>
             )}
        </div>
      </div>
    </>
  );
});

export default GroupNode;
