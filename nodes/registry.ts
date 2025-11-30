
import { ShaderNodeDefinition } from '../types';
import { ShaderNodeDefinitionSchema } from '../utils/schemas';

// Helper to validate if an object is a valid node definition (for JSON import)
export const validateNodeDefinition = (obj: any): obj is ShaderNodeDefinition => {
    const result = ShaderNodeDefinitionSchema.safeParse(obj);
    if (!result.success) {
        console.warn("Node Validation Failed:", result.error.format());
        return false;
    }
    return true;
}

// Helper to normalize a raw JSON object
export const normalizeNodeDefinition = (json: any): ShaderNodeDefinition => {
    // Deep clone to avoid mutating source
    const obj = JSON.parse(JSON.stringify(json));
    
    // Handle "glsl": ["line 1", "line 2"]
    if (obj.data && Array.isArray(obj.data.glsl)) {
        obj.data.glsl = obj.data.glsl.join('\n');
    }

    // Ensure outputs array exists.
    if (!obj.data.outputs) {
        obj.data.outputs = [{ 
            id: 'result', 
            name: 'Result', 
            type: obj.data.outputType || 'vec4' 
        }];
    }

    return obj as ShaderNodeDefinition;
}

// Load all JSON files from the library folder
const modules = import.meta.glob('./library/*.json', { eager: true });

export const NODE_REGISTRY: ShaderNodeDefinition[] = Object.values(modules).map((mod: any) => {
    // The default export or the module itself is the JSON content
    const json = mod.default || mod;
    
    // Optional: Validate library nodes during load
    const validation = ShaderNodeDefinitionSchema.safeParse(json);
    if (!validation.success) {
        console.error(`Invalid Node Definition in library (${json.id || 'unknown'}):`, validation.error.format());
    }

    return normalizeNodeDefinition(json);
});

// Helper to quickly find a definition
export const getNodeDefinition = (id: string) => NODE_REGISTRY.find(n => n.id === id);
