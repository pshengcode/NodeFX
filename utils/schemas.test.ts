// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ShaderNodeDefinitionSchema, UniformValSchema } from './schemas';

describe('Zod Schemas', () => {
    describe('UniformValSchema', () => {
        it('validates a float uniform', () => {
            const data = {
                type: 'float',
                value: 1.0,
                widget: 'slider',
                widgetConfig: { min: 0, max: 1 }
            };
            const result = UniformValSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('validates a vec3 uniform with array value', () => {
            const data = {
                type: 'vec3',
                value: [1.0, 0.5, 0.0],
                widget: 'color'
            };
            const result = UniformValSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('validates a vec3[] uniform with array-of-arrays value', () => {
            const data = {
                type: 'vec3[]',
                value: Array.from({ length: 16 }, () => [0.0, 0.0, 0.0]),
                widget: 'index',
                widgetConfig: {
                    arrayIndex: 0,
                    arrayIndexWidget: 'number',
                    arrayElementWidget: 'default',
                    arrayElementStep: 0.1
                }
            };
            const result = UniformValSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('validates a float[] uniform with array value', () => {
            const data = {
                type: 'float[]',
                value: Array.from({ length: 16 }, () => 0.0),
                widget: 'index',
                widgetConfig: {
                    arrayIndex: 0,
                    arrayIndexWidget: 'slider',
                    arrayElementStep: 0.1
                }
            };
            const result = UniformValSchema.safeParse(data);
            expect(result.success).toBe(true);
        });

        it('fails on invalid type', () => {
            const data = {
                type: 'invalid_type',
                value: 1.0
            };
            const result = UniformValSchema.safeParse(data);
            expect(result.success).toBe(false);
        });
    });

    describe('ShaderNodeDefinitionSchema', () => {
        it('validates a complete node definition', () => {
            const nodeDef = {
                id: 'test_node',
                label: 'Test Node',
                category: 'Math',
                description: 'A test node',
                data: {
                    glsl: 'void run(vec2 uv, out float res) { res = 1.0; }',
                    inputs: [],
                    outputs: [{ id: 'res', name: 'Result', type: 'float' }],
                    outputType: 'float',
                    uniforms: {
                        'uVal': { type: 'float', value: 0.5 }
                    }
                }
            };
            const result = ShaderNodeDefinitionSchema.safeParse(nodeDef);
            expect(result.success).toBe(true);
        });

        it('allows array of strings for GLSL', () => {
            const nodeDef = {
                id: 'multiline_node',
                label: 'Multiline',
                category: 'Custom',
                data: {
                    glsl: ['void run(vec2 uv, out float res) {', '  res = 1.0;', '}'],
                    inputs: [],
                    outputType: 'float'
                }
            };
            const result = ShaderNodeDefinitionSchema.safeParse(nodeDef);
            expect(result.success).toBe(true);
        });

        it('fails if required fields are missing', () => {
            const nodeDef = {
                id: 'bad_node',
                // label missing
                category: 'Math',
                data: {
                    glsl: '',
                    inputs: [],
                    outputType: 'float'
                }
            };
            const result = ShaderNodeDefinitionSchema.safeParse(nodeDef);
            expect(result.success).toBe(false);
        });
    });
});
