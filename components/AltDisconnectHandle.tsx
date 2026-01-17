import React, { useCallback } from 'react';
import { Handle, HandleProps, Position } from 'reactflow';
import { useProjectDispatch } from '../context/ProjectContext';

type AltDisconnectHandleProps = Omit<HandleProps, 'type' | 'id' | 'position' | 'onClick'> & {
    nodeId: string;
    handleId: string;
    handleType: 'source' | 'target';
    position: Position;
    onClick?: (e: React.MouseEvent) => void;
};

const AltDisconnectHandle = ({
    nodeId,
    handleId,
    handleType,
    position,
    onClick,
    ...rest
}: AltDisconnectHandleProps) => {
    const { setEdges } = useProjectDispatch();

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (e.altKey) {
            e.stopPropagation();
            e.preventDefault();
            setEdges((edges) => edges.filter((edge) => {
                if (handleType === 'target') return !(edge.target === nodeId && edge.targetHandle === handleId);
                return !(edge.source === nodeId && edge.sourceHandle === handleId);
            }));
            return;
        }

        onClick?.(e);
    }, [handleId, handleType, nodeId, onClick, setEdges]);

    return (
        <Handle
            type={handleType}
            id={handleId}
            position={position}
            onClick={handleClick}
            {...rest}
        />
    );
};

export default AltDisconnectHandle;
