export type GLSLType = 
  | 'float' | 'int' | 'bool' | 'uint'
  | 'vec2' | 'vec3' | 'vec4' 
  | 'uvec2' | 'uvec3' | 'uvec4'
  | 'mat2' | 'mat3' | 'mat4'
  | 'sampler2D' | 'samplerCube'
  | 'vec2[]';

export type WidgetMode = 
  | 'default' 
  | 'slider' 
  | 'number' 
  | 'angle' 
  | 'pad'
  | 'color' 
  | 'curve' 
  | 'gradient' 
  | 'image'
  | 'toggle' // Checkbox 0/1
  | 'enum'   // Dropdown Select
  | 'range'  // Vec2 Min/Max Slider
  | 'bezier_grid' // 4x4 Bezier Grid Editor
  | 'hidden'; // Hides the UI widget

export interface WidgetConfig {
  min?: number;
  max?: number;
  step?: number;
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  labels?: string[];
  gradientStops?: Array<{ pos: number; color: string }>;
  alphaStops?: Array<{ pos: number; value: number }>;
  curvePoints?: Array<{ x: number; y: number }>;
  curvePointsR?: Array<{ x: number; y: number }>;
  curvePointsG?: Array<{ x: number; y: number }>;
  curvePointsB?: Array<{ x: number; y: number }>;
  curvePointsA?: Array<{ x: number; y: number }>;
  // Configuration for Enum options
  enumOptions?: Array<{ label: string; value: number }>;
  
  // Conditional Visibility
  visibleIf?: {
    uniform: string;
    value?: any;
    notValue?: any;
  };
}

export interface RawTextureData {
  isRaw: true;
  data: Uint8ClampedArray;
  width: number;
  height: number;
  id: string; // Unique hash for caching
  wrapClamp?: boolean; // If true, use CLAMP_TO_EDGE
}

export type UniformValueType = number | number[] | Float32Array | Uint32Array | string | RawTextureData | null;

export interface UniformVal {
  type: GLSLType;
  value: UniformValueType;
  
  // New Architecture
  widget?: WidgetMode;
  widgetConfig?: WidgetConfig;
}

export interface NodeInput {
  id: string;
  name: string;
  type: GLSLType;
}

export interface NodeOutput {
  id: string;   
  name: string; 
  type: GLSLType;
}

export interface SerializedEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    type?: string;
    animated?: boolean;
    data?: any;
}

export interface SerializedNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: NodeData;
    parentId?: string;
    extent?: 'parent' | undefined;
    width?: number | null;
    height?: number | null;
}

export interface NodeData {
  label: string;
  category?: NodeCategory; 
  definitionId?: string; // Added for i18n context lookup
  glsl: string; 
  inputs: NodeInput[];
  outputs: NodeOutput[]; 
  outputType: GLSLType; 
  uniforms: Record<string, UniformVal>;
  preview?: boolean; 
  onUpdate?: (id: string, data: Partial<NodeData>) => void;
  description?: string;
  autoType?: boolean;
  executionError?: string; 
  serverUrl?: string; 
  uploadInterval?: number;
  resolution?: { w: number; h: number };
  customId?: string;
  
  // Internationalization overrides for this instance
  locales?: Record<string, Record<string, string>>;

  // Compound Node Support
  isCompound?: boolean;
  scopeId?: string; // The ID of the parent compound node (or 'root')
  internalNodes?: SerializedNode[];
  internalEdges?: SerializedEdge[];

  // Global Variable Support
  isGlobalVar?: boolean;
  globalName?: string;
  value?: any;

  // Custom Node Settings (Persistence)
  settings?: Record<string, any>;
}

export interface RenderPass {
  id: string;                 
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { type: GLSLType; value: UniformValueType }>;
  outputTo: 'SCREEN' | 'FBO'; 
  inputTextureUniforms: Record<string, string>; 
}

export interface CompilationResult {
  passes: RenderPass[];
  error?: string;
}

export type NodeCategory = 
  | 'Input' 
  | 'Generator' 
  | 'Math' 
  | 'Vector' 
  | 'Color' 
  | 'Filter' 
  | 'Effect' 
  | 'Utility' 
  | 'Output' 
  | 'Network' 
  | 'Custom' 
  | 'User';

export interface ShaderNodeDefinition {
  id: string;         
  label: string;      
  category: NodeCategory;
  icon?: string;       
  description?: string;
  
  // Internationalization: Simple Key-Value Map
  // Example: { zh: { 'Blend': '混合', 'Base': '底图' } }
  locales?: {
    [lang: string]: Record<string, string>;
  };
  
  data: {
    glsl: string;       
    inputs: NodeInput[];
    outputs?: NodeOutput[];
    uniforms?: Record<string, UniformVal>;
    outputType: GLSLType;
    autoType?: boolean;
    serverUrl?: string;
    isCompound?: boolean;
    internalNodes?: SerializedNode[];
    internalEdges?: SerializedEdge[];
  };
}