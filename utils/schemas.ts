import { z } from 'zod';
import { GLSL_TYPE_STRINGS, NODE_CATEGORY_STRINGS, WIDGET_MODE_STRINGS } from '../enums';

// Basic Types
export const GLSLTypeSchema = z.enum(
    GLSL_TYPE_STRINGS as unknown as [string, ...string[]]
);

export const WidgetModeSchema = z.enum([
    ...(WIDGET_MODE_STRINGS as unknown as [string, ...string[]])
]);

export const NodeCategorySchema = z.enum([
    ...(NODE_CATEGORY_STRINGS as unknown as [string, ...string[]])
]);

// Widget Config
export const WidgetConfigSchema = z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().optional(),
    minX: z.number().optional(),
    maxX: z.number().optional(),
    minY: z.number().optional(),
    maxY: z.number().optional(),
    labels: z.array(z.string()).optional(),
    gradientStops: z.array(z.object({
        pos: z.number(),
        color: z.string()
    })).optional(),
    alphaStops: z.array(z.object({
        pos: z.number(),
        value: z.number()
    })).optional(),
    curvePoints: z.array(z.object({
        x: z.number(),
        y: z.number()
    })).optional(),
    curvePointsR: z.array(z.object({
        x: z.number(),
        y: z.number()
    })).optional(),
    curvePointsG: z.array(z.object({
        x: z.number(),
        y: z.number()
    })).optional(),
    curvePointsB: z.array(z.object({
        x: z.number(),
        y: z.number()
    })).optional(),
    curvePointsA: z.array(z.object({
        x: z.number(),
        y: z.number()
    })).optional(),
    enumOptions: z.array(z.object({
        label: z.string(),
        value: z.number()
    })).optional(),
    visibleIf: z.object({
        uniform: z.string(),
        value: z.any().optional(),
        notValue: z.any().optional()
    }).optional(),

    arrayIndex: z.number().int().nonnegative().optional(),
    arrayLength: z.number().int().nonnegative().optional(),
    arrayIndexWidget: z.enum(['number', 'slider']).optional(),
    arrayElementWidget: z.enum(['default', 'slider', 'number', 'angle', 'toggle', 'enum', 'pad', 'range', 'color']).optional(),

    arrayElementStep: z.number().optional(),
    arrayElementMin: z.number().optional(),
    arrayElementMax: z.number().optional(),
    arrayElementRangeStep: z.number().optional(),
    arrayElementMinX: z.number().optional(),
    arrayElementMaxX: z.number().optional(),
    arrayElementMinY: z.number().optional(),
    arrayElementMaxY: z.number().optional()
});

// Uniform Value (JSON compatible)
// We allow number, array of numbers, or null. 
// Complex runtime types like Float32Array are not expected in JSON definitions.
export const UniformValueSchema = z.union([
    z.number(),
    z.boolean(),
    z.array(z.number()),
    z.array(z.boolean()),
    z.array(z.array(z.number())), // Support for vec2[] (array of arrays)
    z.string(),
    z.null()
]);

export const UniformValSchema = z.object({
    type: GLSLTypeSchema,
    value: UniformValueSchema.optional().nullable(), // Allow null/undefined in JSON
    widget: WidgetModeSchema.optional(),
    widgetConfig: WidgetConfigSchema.optional()
});

export const NodeInputSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: GLSLTypeSchema
});

export const NodeOutputSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: GLSLTypeSchema
});

// Multi-Pass Support (node library JSON)
export const PingPongConfigSchema = z.object({
    enabled: z.boolean(),
    bufferName: z.string().optional(),
    initValue: z.union([
        z.tuple([z.number(), z.number(), z.number()]),
        z.tuple([z.number(), z.number(), z.number(), z.number()]),
        z.string()
    ]).optional(),
    persistent: z.boolean().optional(),
    clearEachFrame: z.boolean().optional()
}).optional();

export const NodePassSchema = z.object({
    id: z.string(),
    name: z.string(),
    glsl: z.string(),
    target: z.string().optional(),
    loop: z.number().int().positive().optional(),
    pingPong: PingPongConfigSchema
});

// Serialized Structures for Compound Nodes
export const SerializedEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional().nullable(),
    targetHandle: z.string().optional().nullable(),
    type: z.string().optional(),
    animated: z.boolean().optional(),
    data: z.any().optional()
});

// Recursive schema for SerializedNode is tricky in Zod if strictly needed, 
// but for JSON definitions we can usually use a simpler version or z.lazy if needed.
// For now, we'll define a base structure.
export const SerializedNodeSchema = z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.any(), // We keep data loose here to avoid infinite recursion complexity for now, or refine later
    parentId: z.string().optional(),
    extent: z.enum(['parent']).optional(),
    width: z.number().optional().nullable(),
    height: z.number().optional().nullable()
});

const ShaderNodeDataBaseSchema = z.object({
    inputs: z.array(NodeInputSchema),
    outputs: z.array(NodeOutputSchema).optional(),
    uniforms: z.record(z.string(), UniformValSchema).optional(),
    outputType: GLSLTypeSchema,
    autoType: z.boolean().optional(),
    serverUrl: z.string().optional(),
    isCompound: z.boolean().optional(),
    internalNodes: z.array(SerializedNodeSchema).optional(),
    internalEdges: z.array(SerializedEdgeSchema).optional()
});

const ShaderNodeDataSinglePassSchema = ShaderNodeDataBaseSchema.extend({
    glsl: z.union([z.string(), z.array(z.string())]) // Allow array of strings for overloads/multiline convenience
});

const ShaderNodeDataMultiPassSchema = ShaderNodeDataBaseSchema.extend({
    passes: z.array(NodePassSchema).min(1)
});

export const ShaderNodeDataSchema = z.union([
    ShaderNodeDataSinglePassSchema,
    ShaderNodeDataMultiPassSchema
]);

export const ShaderNodeDefinitionSchema = z.object({
    id: z.string(),
    label: z.string(),
    category: NodeCategorySchema,
    icon: z.string().optional(),
    description: z.string().optional(),
    locales: z.record(z.string(), z.record(z.string(), z.string())).optional(),
    data: ShaderNodeDataSchema
});
