import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTypeInference } from './useTypeInference';
import { Node, Edge } from 'reactflow';
import { NodeData } from '../types';

describe('useTypeInference', () => {
    it('upgrades float node to vec3 when connected to vec3 input', () => {
        const { result } = renderHook(() => useTypeInference());
        const { runTypeInference } = result.current;

        const nodes: Node<NodeData>[] = [
            {
                id: 'source',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Source',
                    glsl: `
                        void run(float val, out float res) { res = val; }
                        void run(vec3 val, out vec3 res) { res = val; }
                    `,
                    inputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {},
                    autoType: true // Enable auto-type
                }
            },
            {
                id: 'target',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Target',
                    glsl: 'void run(vec3 inVal, out vec4 res) { res = vec4(inVal, 1.0); }',
                    inputs: [{ id: 'inVal', name: 'In', type: 'vec3' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'source', target: 'target', targetHandle: 'inVal' }
        ];

        const updatedNodes = runTypeInference(nodes, edges);
        
        expect(updatedNodes).not.toBeNull();
        if (updatedNodes) {
            const updatedSource = updatedNodes.find(n => n.id === 'source');
            expect(updatedSource?.data.outputType).toBe('vec3');
            expect(updatedSource?.data.inputs[0].type).toBe('vec3');
        }
    });

    it('does not change type if autoType is false', () => {
        const { result } = renderHook(() => useTypeInference());
        const { runTypeInference } = result.current;

        const nodes: Node<NodeData>[] = [
            {
                id: 'source',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Source',
                    glsl: `
                        void run(float val, out float res) { res = val; }
                        void run(vec3 val, out vec3 res) { res = val; }
                    `,
                    inputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {},
                    autoType: false // Disable auto-type
                }
            },
            {
                id: 'target',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Target',
                    glsl: 'void run(vec3 inVal, out vec4 res) { res = vec4(inVal, 1.0); }',
                    inputs: [{ id: 'inVal', name: 'In', type: 'vec3' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'source', target: 'target', targetHandle: 'inVal' }
        ];

        const updatedNodes = runTypeInference(nodes, edges);
        expect(updatedNodes).toBeNull(); // No changes
    });

    it('migrates primitive uniform values correctly without crashing', () => {
        const { result } = renderHook(() => useTypeInference());
        const { runTypeInference } = result.current;

        const nodes: Node<NodeData>[] = [
            {
                id: 'source',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Source',
                    glsl: `
                        void run(float val, out float res) { res = val; }
                        void run(vec3 val, out vec3 res) { res = val; }
                    `,
                    inputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {
                        'val': { type: 'float', value: 0.5 } // Primitive value that caused crash
                    },
                    autoType: true
                }
            },
            {
                id: 'target',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Target',
                    glsl: 'void run(vec3 inVal, out vec4 res) { res = vec4(inVal, 1.0); }',
                    inputs: [{ id: 'inVal', name: 'In', type: 'vec3' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'vec4' }],
                    outputType: 'vec4',
                    uniforms: {}
                }
            }
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'source', target: 'target', targetHandle: 'inVal' }
        ];

        const updatedNodes = runTypeInference(nodes, edges);
        
        expect(updatedNodes).not.toBeNull();
        if (updatedNodes) {
            const updatedSource = updatedNodes.find(n => n.id === 'source');
            expect(updatedSource?.data.inputs[0].type).toBe('vec3');
            // Check if value was migrated to array
            const newVal = updatedSource?.data.uniforms['val'].value;
            expect(Array.isArray(newVal)).toBe(true);
            expect(newVal).toEqual([0.5, 0.5, 0.5]);
        }
    });
});
