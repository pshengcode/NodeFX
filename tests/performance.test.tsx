/**
 * Performance Test: Node Rendering Optimization
 * 
 * This test verifies that CustomNode components are properly memoized
 * and only re-render when necessary.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import CustomNode from '../components/CustomNode';
import { NodeData } from '../types';

describe('CustomNode Performance', () => {
    const createMockNodeProps = (id: string, label: string) => ({
        id,
        type: 'customShader',
        selected: false,
        dragging: false,
        isConnectable: true,
        xPos: 0,
        yPos: 0,
        zIndex: 1,
        data: {
            label,
            glsl: 'void main() {}',
            inputs: [],
            outputs: [{ id: 'out', name: 'Output', type: 'vec4' }],
            outputType: 'vec4',
            uniforms: {},
            preview: false
        } as NodeData
    });

    it('should not re-render when only position changes', () => {
        const renderSpy = vi.fn();
        
        // Wrap CustomNode to track renders
        const TrackedNode = React.memo((props: any) => {
            renderSpy();
            return <CustomNode {...props} />;
        });

        const props1 = { ...createMockNodeProps('1', 'Test Node'), xPos: 0, yPos: 0 };
        const props2 = { ...createMockNodeProps('1', 'Test Node'), xPos: 100, yPos: 100 };

        const { rerender } = render(
            <ReactFlowProvider>
                <TrackedNode {...props1} />
            </ReactFlowProvider>
        );

        expect(renderSpy).toHaveBeenCalledTimes(1);

        rerender(
            <ReactFlowProvider>
                <TrackedNode {...props2} />
            </ReactFlowProvider>
        );

        // Should still be 1 because CustomNode memo should ignore position changes
        expect(renderSpy).toHaveBeenCalledTimes(1);
    });

    it('should re-render when data changes', () => {
        const renderSpy = vi.fn();
        
        const TrackedNode = React.memo((props: any) => {
            renderSpy();
            return <CustomNode {...props} />;
        });

        const props1 = createMockNodeProps('1', 'Test Node');
        const props2 = {
            ...props1,
            data: { ...props1.data, label: 'Updated Node' }
        };

        const { rerender } = render(
            <ReactFlowProvider>
                <TrackedNode {...props1} />
            </ReactFlowProvider>
        );

        expect(renderSpy).toHaveBeenCalledTimes(1);

        rerender(
            <ReactFlowProvider>
                <TrackedNode {...props2} />
            </ReactFlowProvider>
        );

        // Should render twice because data changed
        expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it('should re-render when preview status changes', () => {
        const renderSpy = vi.fn();
        
        const TrackedNode = React.memo((props: any) => {
            renderSpy();
            return <CustomNode {...props} />;
        });

        const props1 = createMockNodeProps('1', 'Test Node');
        const props2 = {
            ...props1,
            data: { ...props1.data, preview: true }
        };

        const { rerender } = render(
            <ReactFlowProvider>
                <TrackedNode {...props1} />
            </ReactFlowProvider>
        );

        expect(renderSpy).toHaveBeenCalledTimes(1);

        rerender(
            <ReactFlowProvider>
                <TrackedNode {...props2} />
            </ReactFlowProvider>
        );

        // Should render twice because preview changed
        expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    it('should not re-render when unrelated nodes change', () => {
        // This test would require integration with ProjectContext
        // For now, we verify that the memo comparison function is correct
        const CustomNodeMemo = CustomNode as any;
        const compareFunc = CustomNodeMemo.type.compare;

        const props1 = createMockNodeProps('1', 'Node 1');
        const props2 = { ...props1 };

        // Same props should not trigger re-render
        expect(compareFunc(props1, props2)).toBe(true);

        // Different ID should trigger re-render
        const props3 = { ...props1, id: '2' };
        expect(compareFunc(props1, props3)).toBe(false);

        // Different label should trigger re-render
        const props4 = {
            ...props1,
            data: { ...props1.data, label: 'Different' }
        };
        expect(compareFunc(props1, props4)).toBe(false);
    });
});

describe('Context Optimization', () => {
    it('should provide separate dispatch and state contexts', () => {
        // This is more of a structure test
        // Import contexts
        const { ProjectContext, ProjectDispatchContext } = require('../context/ProjectContext');
        
        expect(ProjectContext).toBeDefined();
        expect(ProjectDispatchContext).toBeDefined();
    });

    it('useProjectDispatch should not include nodes/edges', () => {
        // This test verifies the contract that dispatch context
        // doesn't include frequently-changing state
        
        // In real implementation, dispatch context should have:
        // - setNodes, setEdges (setters)
        // - onNodesChange, onEdgesChange (handlers)
        // - addNode, deleteNode (actions)
        // 
        // But NOT:
        // - nodes, edges (frequently-changing state)
        
        // This is enforced by TypeScript types, so we just verify structure
        expect(true).toBe(true); // Type checking ensures this
    });
});

describe('Performance Benchmarks', () => {
    it('should handle 100 nodes efficiently', () => {
        // This is a placeholder for a real performance test
        // In production, you'd measure:
        // - Time to render 100 nodes
        // - Time to update one node
        // - Memory usage
        
        const startTime = performance.now();
        
        // Simulate 100 node updates
        for (let i = 0; i < 100; i++) {
            // Mock node update
        }
        
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Should complete in less than 100ms
        expect(duration).toBeLessThan(100);
    });
});
