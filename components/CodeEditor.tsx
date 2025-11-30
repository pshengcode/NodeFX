import React, { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';

// Configure Monaco loader securely
// Using unpkg for 'vs' path ensures access to standard raw worker files
if (loader) {
  loader.config({ 
    paths: { vs: 'https://unpkg.com/monaco-editor@0.52.0/min/vs' } 
  });
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  onSave?: () => void;
  onBlur?: () => void;
  height?: string;
  readOnly?: boolean;
  lineNumbers?: 'on' | 'off';
}

const CodeEditor: React.FC<CodeEditorProps> = ({ 
  value, 
  onChange, 
  onSave, 
  onBlur, 
  height = "200px", 
  readOnly = false,
  lineNumbers = 'on'
}) => {
  const editorRef = useRef<any>(null);
  
  // Use refs to store the latest callbacks to avoid stale closures
  // because handleEditorDidMount only runs once.
  const onSaveRef = useRef(onSave);
  const onBlurRef = useRef(onBlur);
  
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onBlurRef.current = onBlur;
  }, [onBlur]);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // --- 1. REGISTER GLSL LANGUAGE ---
    // Only register if not already registered
    if (!monaco.languages.getLanguages().some((l: any) => l.id === 'glsl')) {
        monaco.languages.register({ id: 'glsl' });

        // Syntax Highlighting
        monaco.languages.setMonarchTokensProvider('glsl', {
            defaultToken: 'invalid',
            tokenPostfix: '.glsl',
            keywords: [
                'attribute', 'const', 'uniform', 'varying', 'break', 'continue', 'do', 'for', 'while',
                'if', 'else', 'in', 'out', 'inout', 'float', 'int', 'void', 'bool', 'true', 'false',
                'discard', 'return', 'mat2', 'mat3', 'mat4', 'vec2', 'vec3', 'vec4', 
                'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4',
                'sampler2D', 'samplerCube', 'struct', 'precision', 'highp', 'mediump', 'lowp'
            ],
            builtins: [
                'radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'pow', 'exp', 'log', 
                'exp2', 'log2', 'sqrt', 'inversesqrt', 'abs', 'sign', 'floor', 'ceil', 'fract', 'mod', 
                'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance', 'dot', 'cross', 
                'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult', 'lessThan', 'lessThanEqual', 
                'greaterThan', 'greaterThanEqual', 'equal', 'notEqual', 'any', 'all', 'not', 'texture', 'texture2D', 
                'textureCube', 'dFdx', 'dFdy', 'fwidth', 'gl_FragCoord', 'gl_FragColor', 'gl_Position', 'uv', 'vUv', 'u_time', 'u_resolution'
            ],
            operators: [
                '=', '>', '<', '!', '~', '?', ':',
                '==', '<=', '>=', '!=', '&&', '||', '++', '--',
                '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>',
                '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>='
            ],
            symbols: /[=><!~?:&|+\-*\/\^%]+/,
            tokenizer: {
                root: [
                    [/[a-zA-Z_]\w*/, { cases: { '@keywords': 'keyword', '@builtins': 'predefined', '@default': 'identifier' } }],
                    [/[{}()\[\]]/, '@brackets'],
                    [/[<>](?!@symbols)/, '@brackets'],
                    [/@symbols/, { cases: { '@operators': 'operator', '@default': '' } }],
                    [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                    [/\d+/, 'number'],
                    [/[;,.]/, 'delimiter'],
                    [/\/\/.*$/, 'comment'],
                    [/\/\*/, 'comment', '@comment'],
                ],
                comment: [
                    [/[^\/*]+/, 'comment'],
                    [/\*\//, 'comment', '@pop'],
                    [/[\/*]/, 'comment']
                ],
            }
        });

        // Autocomplete
        monaco.languages.registerCompletionItemProvider('glsl', {
            provideCompletionItems: (model: any, position: any) => {
                const word = model.getWordUntilPosition(position);
                const range = {
                    startLineNumber: position.lineNumber,
                    endLineNumber: position.lineNumber,
                    startColumn: word.startColumn,
                    endColumn: word.endColumn
                };
                
                const suggestions = [
                    ...['float', 'int', 'vec2', 'vec3', 'vec4', 'void', 'if', 'else', 'for', 'return', 'uniform', 'in', 'out'].map(k => ({
                        label: k,
                        kind: monaco.languages.CompletionItemKind.Keyword,
                        insertText: k,
                        range
                    })),
                    ...['sin', 'cos', 'mix', 'smoothstep', 'texture', 'length', 'distance', 'normalize', 'clamp', 'pow', 'dot', 'cross', 'reflect'].map(k => ({
                        label: k,
                        kind: monaco.languages.CompletionItemKind.Function,
                        insertText: k + '(${1})',
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        range
                    })),
                     ...['u_time', 'u_resolution', 'vUv', 'uv', 'gl_FragCoord'].map(k => ({
                        label: k,
                        kind: monaco.languages.CompletionItemKind.Variable,
                        insertText: k,
                        range
                    }))
                ];
                return { suggestions };
            }
        });
    }
    // ----------------------------

    // --- 2. COMMAND BINDING (Ctrl+S) ---
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (onSaveRef.current) onSaveRef.current();
    });

    // Bind blur manually
    editor.onDidBlurEditorWidget(() => {
        if (onBlurRef.current) onBlurRef.current();
    });
  };

  return (
    <div 
        className="nodrag border border-zinc-700 rounded overflow-hidden shadow-inner h-full w-full bg-[#1e1e1e]" 
        // IMPORTANT: Stop propagation to prevent ReactFlow from dragging the node when selecting text
        onMouseDown={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
    >
      <Editor
        height={height}
        defaultLanguage="glsl" // Use our custom language ID
        theme="vs-dark"
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 12,
          lineNumbers: lineNumbers,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          fontFamily: 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace',
          quickSuggestions: { other: true, comments: false, strings: false }, // Explicitly enable suggestions
          suggest: {
            showKeywords: true,
            showSnippets: true,
          },
          scrollbar: {
              vertical: 'visible',
              horizontal: 'visible',
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
              useShadows: false
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'line',
          contextmenu: true, 
          fixedOverflowWidgets: true // Helps with autocomplete popups in nodes
        }}
      />
    </div>
  );
};

export default CodeEditor;