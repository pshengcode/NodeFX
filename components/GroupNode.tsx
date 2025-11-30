
import React, { memo, useState, useCallback } from 'react';
import { NodeProps, NodeResizer, useReactFlow } from 'reactflow';
import { NodeData } from '../types';
import { useTranslation } from 'react-i18next';

const GroupNode = memo(({ id, data, selected }: NodeProps<NodeData>) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(data.label || t('Group'));
  const { setNodes } = useReactFlow();

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
      
      {/* Clean Background Frame */}
      <div className={`relative w-full h-full rounded transition-all duration-300 ${selected ? 'bg-zinc-800/20 ring-1 ring-blue-500/30' : 'bg-zinc-900/20'}`}>
        
        {/* Label Container - Embedded look */}
        <div className="absolute top-2 left-2 max-w-[90%] z-10">
             {isEditing ? (
                 <input 
                    className="bg-zinc-800 text-xl font-bold px-2 py-1 rounded border border-blue-500/40 outline-none text-zinc-200 w-full"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => { e.stopPropagation(); if(e.key === 'Enter') setIsEditing(false); }}
                    onBlur={() => setIsEditing(false)}
                    placeholder={t("Group Name")}
                    autoFocus
                />
             ) : (
                <div 
                    onDoubleClick={() => setIsEditing(true)} 
                    className="text-xl font-bold text-zinc-500 hover:text-blue-400 transition-colors uppercase tracking-widest cursor-text select-none px-2 py-1"
                >
                    {label}
                </div>
             )}
        </div>
      </div>
    </>
  );
});

export default GroupNode;
