export type GLSLType = 'float' | 'int' | 'vec2' | 'vec3' | 'vec4' | 'sampler2D';

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
}

export interface UniformVal {
  type: GLSLType;
  value: any;
  
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
  internalNodes?: any[];
  internalEdges?: any[];
}

export interface RenderPass {
  id: string;                 
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { type: GLSLType; value: any }>;
  outputTo: 'SCREEN' | 'FBO'; 
  inputTextureUniforms: Record<string, string>; 
}

export interface CompilationResult {
  passes: RenderPass[];
  error?: string;
}

export type NodeCategory = 'Source' | 'Filter' | 'Math' | 'Output' | 'Network' | 'Custom' | 'User';

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
    internalNodes?: any[];
    internalEdges?: any[];
  };
}