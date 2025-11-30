
import { CompilationResult, GLSLType, RawTextureData } from '../types';
import { assetManager } from './assetManager';

// Shared Shaders
const DISPLAY_VERT = `#version 300 es
in vec2 position;
uniform vec2 uOffset;
uniform float uZoom;
out vec2 vUv;
void main() {
    vec2 baseUv = position * 0.5 + 0.5;
    vUv = (baseUv - 0.5) / uZoom + 0.5 - uOffset;
    gl_Position = vec4(position, 0.0, 1.0);
}`;

const DISPLAY_FRAG = `#version 300 es
precision mediump float;
uniform sampler2D tDiffuse;
uniform int uChannel;
uniform bool uTiling;
in vec2 vUv;
out vec4 fragColor;
void main() {
    if (!uTiling && (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0)) {
        fragColor = vec4(0.0);
        return;
    }
    vec4 tex = texture(tDiffuse, vUv);
    if (uChannel == 0) fragColor = tex;
    else if (uChannel == 1) fragColor = vec4(tex.rrr, 1.0);
    else if (uChannel == 2) fragColor = vec4(tex.ggg, 1.0);
    else if (uChannel == 3) fragColor = vec4(tex.bbb, 1.0);
    else if (uChannel == 4) fragColor = vec4(tex.aaa, 1.0);
}`;

class WebGLSystem {
    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;
    
    private programs: Map<string, { prog: WebGLProgram, uniforms: Map<string, WebGLUniformLocation | null> }> = new Map();
    private sourceCache: Map<string, { v: string; f: string }> = new Map();
    private fboCache: Map<string, { fbo: WebGLFramebuffer, tex: WebGLTexture, w: number, h: number }> = new Map();
    private textureCache: Map<string, WebGLTexture> = new Map();
    
    private displayProgram: WebGLProgram | null = null;
    private quadBuffer: WebGLBuffer | null = null;
    
    private startTime: number = Date.now();

    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 512;
        // Offscreen canvas doesn't strictly need to be attached, but good for debugging if needed
        const gl = this.canvas.getContext('webgl2', { 
            preserveDrawingBuffer: false,
            alpha: true,
            antialias: false 
        });
        
        if (!gl) throw new Error("WebGL2 Not Supported in Global System");
        this.gl = gl;

        if (!gl.getExtension('EXT_color_buffer_float')) {
            console.warn("EXT_color_buffer_float missing");
        }
        gl.getExtension('OES_texture_float_linear');

        this.initShared();
    }

    private initShared() {
        const gl = this.gl;
        
        // Quad Buffer
        this.quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

        // Display Program
        const vert = this.createShader(gl.VERTEX_SHADER, DISPLAY_VERT);
        const frag = this.createShader(gl.FRAGMENT_SHADER, DISPLAY_FRAG);
        if (vert && frag) {
            this.displayProgram = this.createProgram(vert, frag);
        }
    }

    private createShader(type: number, source: string) {
        const s = this.gl.createShader(type)!;
        this.gl.shaderSource(s, source);
        this.gl.compileShader(s);
        if (!this.gl.getShaderParameter(s, this.gl.COMPILE_STATUS)) {
            console.error("Shader Compile Error:", this.gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }

    private createProgram(v: WebGLShader, f: WebGLShader) {
        const p = this.gl.createProgram()!;
        this.gl.attachShader(p, v);
        this.gl.attachShader(p, f);
        this.gl.linkProgram(p);
        if (!this.gl.getProgramParameter(p, this.gl.LINK_STATUS)) {
            console.error("Program Link Error:", this.gl.getProgramInfoLog(p));
            return null;
        }
        // Shaders can be detached and deleted after linking to save memory
        this.gl.detachShader(p, v);
        this.gl.detachShader(p, f);
        this.gl.deleteShader(v);
        this.gl.deleteShader(f);
        return p;
    }

    // --- RESOURCE MANAGEMENT ---
    public cleanup(activePassIds: string[]) {
        const gl = this.gl;
        const activeSet = new Set(activePassIds);

        // 1. Cleanup Unused Programs
        for (const [id, programData] of this.programs.entries()) {
            if (!activeSet.has(id)) {
                gl.deleteProgram(programData.prog);
                this.programs.delete(id);
                this.sourceCache.delete(id);
                // console.log(`[WebGL] Cleaned up program: ${id}`);
            }
        }

        // 2. Cleanup Unused FBOs
        // FBO keys are like "passId_width_height" or "__FINAL__..."
        for (const [key, fboData] of this.fboCache.entries()) {
            // Extract passId from key (assuming format: passId_w_h)
            // We need to be careful not to delete __FINAL__ or other system FBOs if we want to keep them
            if (key.startsWith('__FINAL__')) continue;

            const parts = key.split('_');
            // Reconstruct ID (might contain underscores, so we pop the last two dimensions)
            const h = parts.pop();
            const w = parts.pop();
            const passId = parts.join('_');

            if (!activeSet.has(passId)) {
                gl.deleteFramebuffer(fboData.fbo);
                gl.deleteTexture(fboData.tex);
                this.fboCache.delete(key);
                // console.log(`[WebGL] Cleaned up FBO: ${key}`);
            }
        }
    }

    private getFBO(id: string, w: number, h: number, useMipmap: boolean) {
        const gl = this.gl;
        const key = `${id}_${w}_${h}`; // Resize check
        
        if (this.fboCache.has(key)) return this.fboCache.get(key)!;

        // Clean up old FBOs for this ID if size changed
        // (Simple implementation: just create new, key handles uniqueness. 
        // Real implementation would find old keys starting with id_ and delete them)
        
        const fbo = gl.createFramebuffer();
        const tex = gl.createTexture();
        if(!fbo || !tex) throw new Error("FBO Creation Failed");

        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
        
        if (useMipmap) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        
        const obj = { fbo, tex, w, h };
        this.fboCache.set(key, obj);
        return obj;
    }

    private getTexture(value: string | RawTextureData) {
        const gl = this.gl;
        let id = typeof value === 'string' ? value : value.id;
        
        // Is it an asset reference?
        if (typeof value === 'string' && value.startsWith('asset://')) {
            const asset = assetManager.getSync(value);
            if (!asset) return null; // Asset not loaded yet
            
            // If asset is RawTextureData, use its internal ID for cache key
            if ((asset as any).isRaw) {
                 // Use the ID from the raw data object inside the asset
                 const raw = asset as RawTextureData;
                 id = raw.id;
                 value = raw; // treat as raw data now
            } else if (typeof asset === 'string') {
                 // Base64 string from asset manager
                 // Use the original asset ID as cache key
                 id = value;
                 value = asset; // treat as data url
            }
        }

        if (this.textureCache.has(id)) return this.textureCache.get(id)!;

        const tex = gl.createTexture();
        if(!tex) return null;

        gl.bindTexture(gl.TEXTURE_2D, tex);

        if (typeof value === 'string') {
            // Data URL
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,255]));
            const img = new Image();
            img.onload = () => {
                if(!gl.isTexture(tex)) return;
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            };
            img.src = value;
        } else {
            // Raw Data
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, value.width, value.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, value.data);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

        this.textureCache.set(id, tex);
        return tex;
    }

    public render(
        data: CompilationResult, 
        targetCanvas: HTMLCanvasElement, 
        width: number, 
        height: number, 
        channelMode: number = 0,
        onError?: (passId: string, err: string) => void,
        tiling: boolean = false,
        zoom: number = 1.0,
        pan: { x: number, y: number } = { x: 0, y: 0 }
    ) {
        if (!data || data.error || !this.displayProgram) return;

        const gl = this.gl;
        
        // Resize Global Canvas to match exactly.
        // This is crucial because WebGL draws to bottom-left, but drawImage reads from top-left.
        // If the canvas is larger than the viewport, we might read empty pixels from the top.
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // --- COMPILATION PHASE ---
        for (const pass of data.passes) {
            const cached = this.sourceCache.get(pass.id);
            // Only recompile if SHADER CODE changed. Ignore uniforms.
            if (!cached || cached.v !== pass.vertexShader || cached.f !== pass.fragmentShader) {
                // Recompile
                const vs = this.createShader(gl.VERTEX_SHADER, pass.vertexShader);
                const fs = this.createShader(gl.FRAGMENT_SHADER, pass.fragmentShader);
                if (!vs || !fs) {
                     if(onError) onError(pass.id, "Shader Compile Failed");
                     return;
                }
                const prog = this.createProgram(vs, fs);
                if (!prog) {
                    if(onError) onError(pass.id, "Program Link Failed");
                    return;
                }
                
                // Cache Uniform Locations immediately after linking
                const uniformCache = new Map<string, WebGLUniformLocation | null>();
                const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
                for (let i = 0; i < numUniforms; ++i) {
                    const info = gl.getActiveUniform(prog, i);
                    if (info) {
                        uniformCache.set(info.name, gl.getUniformLocation(prog, info.name));
                    }
                }

                this.programs.set(pass.id, { prog, uniforms: uniformCache });
                this.sourceCache.set(pass.id, { v: pass.vertexShader, f: pass.fragmentShader });
            }
        }

        // --- RENDER PHASE ---
        let lastTex: WebGLTexture | null = null;
        const activePassIds: string[] = [];
        
        for (const pass of data.passes) {
            activePassIds.push(pass.id);
            const programData = this.programs.get(pass.id);
            if (!programData) continue;

            const { prog, uniforms } = programData;
            gl.useProgram(prog);

            // Determine Target
            let fbo = null;
            let currentTex = null;
            let mipmap = false;

            if (pass.outputTo === 'FBO') {
                const obj = this.getFBO(pass.id, width, height, true);
                fbo = obj.fbo;
                currentTex = obj.tex;
                mipmap = true;
            } else {
                // Final Pass -> Internal Final Buffer (Not Screen, because we are offscreen)
                const obj = this.getFBO('__FINAL__', width, height, false);
                fbo = obj.fbo;
                currentTex = obj.tex;
                lastTex = obj.tex;
            }

            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.viewport(0, 0, width, height);

            // Clear buffer to prevent ghosting
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            // Bind Quad
            const posLoc = gl.getAttribLocation(prog, "position");
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            // Uniforms
            const timeLoc = uniforms.get("u_time");
            const resLoc = uniforms.get("u_resolution");
            if (timeLoc) gl.uniform1f(timeLoc, (Date.now() - this.startTime) / 1000);
            if (resLoc) gl.uniform2f(resLoc, width, height);

            let texUnit = 0;
            
            // Standard Uniforms
            Object.entries(pass.uniforms).forEach(([name, val]) => {
                // Use cached location instead of getUniformLocation
                const loc = uniforms.get(name) || null;
                if (loc) {
                    const u = val as { type: GLSLType; value: any };
                    if (u.type === 'sampler2D' && u.value) {
                        const tex = this.getTexture(u.value);
                        if (tex) {
                            // FEEDBACK GUARD: If input texture is same as current output, prevent bind
                            if (tex === currentTex) {
                                gl.activeTexture(gl.TEXTURE0 + texUnit);
                                gl.bindTexture(gl.TEXTURE_2D, null); // Bind black/empty
                            } else {
                                gl.activeTexture(gl.TEXTURE0 + texUnit);
                                gl.bindTexture(gl.TEXTURE_2D, tex);
                            }
                            gl.uniform1i(loc, texUnit++);
                        }
                    } else if (u.type === 'float') gl.uniform1f(loc, u.value);
                    else if (u.type === 'vec2') gl.uniform2fv(loc, u.value);
                    else if (u.type === 'vec3') gl.uniform3fv(loc, u.value);
                    else if (u.type === 'vec4') gl.uniform4fv(loc, u.value);
                    else if (u.type === 'int') gl.uniform1i(loc, u.value);
                }
            });

            // Pass Inputs
            if (pass.inputTextureUniforms) {
                 Object.entries(pass.inputTextureUniforms).forEach(([_, uName]) => {
                     const loc = gl.getUniformLocation(prog, uName as string);
                     const match = (uName as string).match(/u_pass_(.*)_tex/);
                     if (match && loc) {
                         const depId = match[1];
                         // Find pass by "clean" ID (replacing - with _)
                         const srcPass = data.passes.find(p => p.id.replace(/-/g, '_') === depId);
                         if (srcPass) {
                             // Get the FBO used by that pass
                             const obj = this.getFBO(srcPass.id, width, height, true);
                             
                             // FEEDBACK GUARD: Check collision
                             if (obj.tex === currentTex) {
                                 gl.activeTexture(gl.TEXTURE0 + texUnit);
                                 gl.bindTexture(gl.TEXTURE_2D, null); 
                             } else {
                                 gl.activeTexture(gl.TEXTURE0 + texUnit);
                                 gl.bindTexture(gl.TEXTURE_2D, obj.tex);
                             }
                             gl.uniform1i(loc, texUnit++);
                         }
                     }
                 });
            }

            gl.drawArrays(gl.TRIANGLES, 0, 6);

            if (mipmap && currentTex) {
                gl.bindTexture(gl.TEXTURE_2D, currentTex);
                gl.generateMipmap(gl.TEXTURE_2D);
            }
        }

        // --- FINAL DISPLAY TO TARGET 2D CANVAS ---
        if (lastTex && targetCanvas) {
            // We use the Global Canvas to draw the final result color-corrected/swizzled
            // And then copy it to the 2D canvas
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Actually we need to draw to a temp buffer or just read pixels? 
            // Since we are offscreen, binding to null renders to the internal canvas storage.
            // But we have resizing issues if we rely on canvas size. 
            // Let's use a ReadBuffer approach.
            
            // Reuse __FINAL__ FBO content, but we need to apply the Display Shader (Channel Select)
            // So we render ONE MORE TIME to the screen buffer (or another FBO)
            
            gl.viewport(0, 0, width, height);
            gl.useProgram(this.displayProgram);
            
            const posLoc = gl.getAttribLocation(this.displayProgram, "position");
            gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            const texLoc = gl.getUniformLocation(this.displayProgram, "tDiffuse");
            const modeLoc = gl.getUniformLocation(this.displayProgram, "uChannel");
            const offsetLoc = gl.getUniformLocation(this.displayProgram, "uOffset");
            const zoomLoc = gl.getUniformLocation(this.displayProgram, "uZoom");
            const tilingLoc = gl.getUniformLocation(this.displayProgram, "uTiling");
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, lastTex);
            
            // Update Wrap Mode based on tiling
            const wrap = tiling ? gl.REPEAT : gl.CLAMP_TO_EDGE;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);

            gl.uniform1i(texLoc, 0);
            gl.uniform1i(modeLoc, channelMode);
            gl.uniform2f(offsetLoc, pan.x / width, -pan.y / height);
            gl.uniform1f(zoomLoc, zoom);
            gl.uniform1i(tilingLoc, tiling ? 1 : 0);

            // Draw to the Global Canvas's Backbuffer
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.drawArrays(gl.TRIANGLES, 0, 6);

            // Now Copy to Target 2D Canvas
            const ctx = targetCanvas.getContext('2d');
            if (ctx) {
                // Ensure target dimensions match
                if (targetCanvas.width !== width || targetCanvas.height !== height) {
                    targetCanvas.width = width;
                    targetCanvas.height = height;
                }
                
                // DrawImage is the fastest way to transfer
                // Note: sx, sy, sw, sh are needed because global canvas might be larger than width/height
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(this.canvas, 0, 0, width, height, 0, 0, width, height);
            }
        }

        // Perform Cleanup (Garbage Collection)
        this.cleanup(activePassIds);
    }
}

export const webglSystem = new WebGLSystem();
