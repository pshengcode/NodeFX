// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { compileGraph } from './shaderCompiler';
import { Node, Edge } from 'reactflow';
import { NodeData } from '../types';

// Mock texture generation
vi.mock('./textureGen', () => ({
    generateGradientTexture: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    generateCurveTexture: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 })
}));

describe('shaderCompiler Extended', () => {
    it('renames helper functions to avoid collisions', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'n1',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Node 1',
                    glsl: `
                        float myFunc(float x) { return x * 2.0; }
                        void run(vec2 uv, out float res) { res = myFunc(1.0); }
                    `,
                    inputs: [],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            },
            {
                id: 'n2',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Node 2',
                    glsl: `
                        float myFunc(float x) { return x * 3.0; }
                        void run(vec2 uv, float in1, out float res) { res = myFunc(in1); }
                    `,
                    inputs: [{ id: 'in1', name: 'In', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            }
        ];
        
        const edges: Edge[] = [
             { id: 'e1', source: 'n1', target: 'n2', targetHandle: 'in1', sourceHandle: 'res' }
        ];

        const result = compileGraph(nodes, edges, 'n2');
        expect(result.error).toBeUndefined();
        const code = result.passes[0].fragmentShader;
        
        expect(code).toContain('float node_n1_myFunc(float x)');
        expect(code).toContain('float node_n2_myFunc(float x)');
        expect(code).toContain('node_n1_myFunc(1.0)');
        expect(code).toContain('node_n2_myFunc(');
    });

    it('generates uniforms correctly', () => {
        const nodes: Node<NodeData>[] = [
            {
                id: 'n1',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Uniform Node',
                    glsl: 'void run(vec2 uv, float uVal, out float res) { res = uVal; }',
                    inputs: [{ id: 'uVal', name: 'UVal', type: 'float' }],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {
                        'uVal': { type: 'float', value: 0.5, widget: 'slider' }
                    }
                }
            }
        ];
        const result = compileGraph(nodes, [], 'n1');
        expect(result.error).toBeUndefined();
        const pass = result.passes[0];
        
        expect(pass.fragmentShader).toContain('uniform float u_n1_uVal;');
        expect(pass.uniforms['u_n1_uVal']).toBeDefined();
        expect(pass.uniforms['u_n1_uVal'].value).toBe(0.5);
    });
    
    it('handles disconnected inputs with defaults', () => {
         const nodes: Node<NodeData>[] = [
            {
                id: 'n1',
                type: 'customShader',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Node',
                    glsl: 'void run(vec2 uv, float in1, vec3 in2, out float res) { res = in1; }',
                    inputs: [
                        { id: 'in1', name: 'In1', type: 'float' },
                        { id: 'in2', name: 'In2', type: 'vec3' }
                    ],
                    outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            }
        ];
        const result = compileGraph(nodes, [], 'n1');
        const code = result.passes[0].fragmentShader;
        
        // Should call with defaults
        // float default 0.0, vec3 default vec3(0.0)
        // The call args are constructed in order.
        // node_n1_run(uv, 0.0, vec3(0.0), out_n1_res)
        expect(code).toMatch(/node_n1_run\(uv, 0\.0, vec3\(0\.0\), out_n1_res\)/);
    });

    it('compiles compound nodes', () => {
        // Define inner nodes for the compound node
        const innerNodes: Node<NodeData>[] = [
            {
                id: 'inner_in',
                type: 'graphInput',
                position: { x: 0, y: 0 },
                data: {
                    label: 'Input',
                    glsl: '',
                    inputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputs: [{ id: 'val', name: 'Val', type: 'float' }],
                    outputType: 'float',
                    scopeId: 'compound1',
                    uniforms: {}
                }
            },
            {
                id: 'inner_process',
                type: 'customShader',
                position: { x: 100, y: 0 },
                data: {
                    label: 'Process',
                    glsl: 'void run(vec2 uv, float a, out float b) { b = a * 2.0; }',
                    inputs: [{ id: 'a', name: 'A', type: 'float' }],
                    outputs: [{ id: 'b', name: 'B', type: 'float' }],
                    outputType: 'float',
                    scopeId: 'compound1',
                    uniforms: {}
                }
            },
            {
                id: 'inner_out',
                type: 'graphOutput',
                position: { x: 200, y: 0 },
                data: {
                    label: 'Output',
                    glsl: '',
                    inputs: [{ id: 'res', name: 'Res', type: 'float' }],
                    outputs: [],
                    outputType: 'float',
                    scopeId: 'compound1',
                    uniforms: {}
                }
            }
        ];

        const innerEdges: Edge[] = [
            { id: 'ie1', source: 'inner_in', target: 'inner_process', sourceHandle: 'val', targetHandle: 'a' },
            { id: 'ie2', source: 'inner_process', target: 'inner_out', sourceHandle: 'b', targetHandle: 'res' }
        ];

        // The Compound Node itself
        const compoundNode: Node<NodeData> = {
            id: 'compound1',
            type: 'group',
            position: { x: 0, y: 0 },
            data: {
                label: 'Group',
                glsl: '', // Will be generated
                isCompound: true,
                inputs: [{ id: 'val', name: 'Val', type: 'float' }],
                outputs: [{ id: 'res', name: 'Res', type: 'float' }],
                outputType: 'float',
                uniforms: {}
            }
        };

        // External graph using the compound node
        const nodes: Node<NodeData>[] = [
            {
                id: 'source',
                type: 'customShader',
                position: { x: -100, y: 0 },
                data: {
                    label: 'Source',
                    glsl: 'void run(vec2 uv, out float out1) { out1 = 5.0; }',
                    inputs: [],
                    outputs: [{ id: 'out1', name: 'Out1', type: 'float' }],
                    outputType: 'float',
                    uniforms: {}
                }
            },
            compoundNode,
            ...innerNodes // In the real app, these are in the same list but filtered by scopeId
        ];

        const edges: Edge[] = [
            { id: 'e1', source: 'source', target: 'compound1', sourceHandle: 'out1', targetHandle: 'val' },
            ...innerEdges
        ];

        const result = compileGraph(nodes, edges, 'compound1');
        expect(result.error).toBeUndefined();
        const code = result.passes[0].fragmentShader;

        // Check if inner logic is present
        // The compiler should generate a function for the compound node that contains the inner logic
        // Or it inlines it?
        // Based on compileCompoundNode implementation, it generates a function `run` (renamed to node_compound1_run)
        // that calls inner functions.
        
        expect(code).toContain('void node_compound1_run');
        expect(code).toContain('node_inner_process_run'); // Inner node function called
        expect(code).toContain('node_source_run'); // Source called
    });
});
