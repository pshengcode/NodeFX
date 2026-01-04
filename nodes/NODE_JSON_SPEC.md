
# Shader Node JSON Specification

本文档描述 `nodes/library/*.json` 的结构与字段语义，用于内置/示例节点库。

- 运行时/构建时的 schema 校验：见 [utils/schemas.ts](../utils/schemas.ts)
- 关键 TypeScript 类型定义：见 [types.ts](../types.ts)

## 1. 顶层结构（ShaderNodeDefinition）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | 节点唯一 ID（建议全大写，如 `BLEND`）。 |
| `label` | `string` | 是 | 默认显示名（也可通过 `locales` 覆盖）。 |
| `category` | `string` | 是 | 分类（用于侧边栏分组）。 |
| `icon` | `string` | 否 | Lucide icon 名称（用于 UI 展示）。 |
| `description` | `string` | 否 | 简要描述（用于 UI/搜索/提示）。 |
| `locales` | `Record<string, Record<string, string>>` | 否 | 多语言字段覆盖（如 label/description）。 |
| `data` | `object` | 是 | 节点核心数据（GLSL、输入输出、uniform 默认值等）。 |

**category 建议值（可扩展）**

`Input` / `Generator` / `Math` / `Vector` / `Color` / `Filter` / `Effect` / `Utility` / `Output` / `Network` / `Custom` / `User`

## 2. data（ShaderNodeData）

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `glsl` | `string \| string[]` | 是 | GLSL 源码。**编写节点时要求使用 `string[]`（按行写）**，系统会在加载时用 `\n` 连接成单一 GLSL 源码字符串，避免手动写 `\n` 转义与长行字符串难维护的问题。为兼容历史节点，仍接受 `string` 写法。需包含 `void run(...)`。 |
| `inputs` | `NodeInput[]` | 否 | 节点输入端口定义（用于连线/类型推断/默认 UI）。 |
| `outputs` | `NodeOutput[]` | 否 | 节点输出端口定义。 |
| `uniforms` | `Record<string, UniformVal>` | 否 | 可选：为部分输入提供默认值/控件配置（用于节点面板）。 |
| `outputType` | `GLSLType` | 否 | 可选：节点主输出类型（部分旧节点会用到）。 |
| `autoType` | `boolean` | 否 | 可选：是否启用自动类型推断/适配（常用于 CustomShader）。 |

### 2.1 类型（GLSLType / NodeInput / NodeOutput）

```ts
type GLSLType =
  | 'float' | 'int' | 'bool' | 'uint'
  | 'vec2' | 'vec3' | 'vec4'
  | 'uvec2' | 'uvec3' | 'uvec4'
  | 'mat2' | 'mat3' | 'mat4'
  | 'sampler2D' | 'samplerCube'
  | 'vec2[]';

type NodeInput = { id: string; name: string; type: GLSLType };
type NodeOutput = { id: string; name: string; type: GLSLType };
```

### 2.2 uniforms 与 UI 控件

`uniforms` 的 key 必须对应 `inputs[].id`（同名 input 才能在 UI 中显示/编辑默认值）。

```json
"uniforms": {
  "intensity": {
    "type": "float",
    "value": 0.5,
    "widget": "slider",
    "widgetConfig": { "min": 0, "max": 1, "step": 0.01 }
  }
}
```

**widget 可用值（与 UI 组件集对应）**

`default` / `slider` / `number` / `angle` / `pad` / `color` / `curve` / `gradient` / `image` / `toggle` / `enum` / `range` / `bezier_grid` / `hidden`

**value 说明（与 schema/类型匹配）**

- `number`
- `boolean`
- `number[]`：用于 `vec2/vec3/vec4/mat*`
- `number[][]`：用于 `vec2[]`
- `string`：常用于资源引用（如 `asset://...` / `builtin://...`）
- `null`：用于 sampler 占位（表示未选择/未绑定）

### 2.3 条件显示（visibleIf）

`widgetConfig.visibleIf` 用于根据另一个 uniform 的值控制当前控件是否显示。

```json
"widgetConfig": {
  "visibleIf": {
    "uniform": "mode",
    "value": 1
  }
}
```

字段说明：
- `uniform`：被依赖的 uniform id
- `value`：当目标 uniform 等于该值时显示
- `notValue`：当目标 uniform 不等于该值时显示（优先级高于 `value`）

## 3. GLSL Overloads（多签名）

节点的多签名（Overload）**写在 GLSL 源码内部**，通过 `//[Item("Name", order)]` 元数据声明多个 `run(...)`。
`data.glsl` 本身即使是 `string[]`，也只是“按行书写的便利形式”（加载时会 join 成一个字符串），并不代表“一项一个 overload”。
UI 会根据 `//[Item("Name", order)]` 元数据提供可选项，默认选择最小 order（相同 order 时按代码顺序）。

```glsl
//[Item("Float", 0)]
void run(float x, out float outVal) { outVal = x; }

//[Item("Vec3", 1)]
void run(vec3 x, out vec3 outVal) { outVal = x; }
```

### 3.1 GLSL 约定（核心）

- `void run(...)` 中必须包含至少一个 `out` 参数作为输出。
- 输出参数名不强制，但建议使用：`result` / `outColor` / `outVal` / `out_image`。
- **数组输入的 index 变量（方案 B，始终生成）**：
  - 只要 `run(...)` 的某个输入参数是数组（如 `float[]/vec3[]/int[]/...`），编译器就会在该节点的 `run(...)` 函数体内自动注入一个局部变量：`<inputId>_index`。
  - 这里的 `inputId` 指的是该输入的参数名（也应与 `data.inputs[].id` 对应）。例如参数 `float inArr[16]` 会生成 `int inArr_index = ...;`。
  - `*_index` 的值来自一个隐式 uniform：`u_<nodeInstanceId>_<inputId>_index`（运行时会把节点实例 id 里的 `-` 替换为 `_`）。
  - 为避免越界，编译期会自动 clamp：`<inputId>_index = clamp(u_..._index, 0, Len-1)`。
  - 默认值为 0；如果节点的 `uniforms[inputId].widgetConfig.arrayIndex` 有值，则以该值作为初始 index（并 clamp）。

示例：

```glsl
void run(vec2 uv, float inArr[16], out float outVal) {
  // 系统注入：int inArr_index = clamp(u_xxx_inArr_index, 0, 15);
  outVal = inArr[inArr_index];
}
```
- 具体渲染/类型适配规则以运行时代码与 schema 为准。

## 4. 示例

```json
{
  "id": "VIGNETTE",
  "label": "Vignette",
  "category": "Filter",
  "description": "Adds a dark border around the image",
  "data": {
    "glsl": [
      "void run(vec2 uv, sampler2D inputTex, float intensity, out vec4 result) {",
      "  vec4 c = texture(inputTex, uv);",
      "  result = vec4(c.rgb * intensity, c.a);",
      "}"
    ],
    "inputs": [
      { "id": "inputTex", "name": "Input", "type": "sampler2D" },
      { "id": "intensity", "name": "Intensity", "type": "float" }
    ],
    "outputs": [
      { "id": "result", "name": "Result", "type": "vec4" }
    ],
    "outputType": "vec4",
    "uniforms": {
      "intensity": { "type": "float", "value": 1, "widget": "slider", "widgetConfig": { "min": 0, "max": 2, "step": 0.01 } }
    }
  }
}
```

---

## 5. Multi-Pass 渲染

### 5.1 NodePass 结构

Multi-Pass节点允许执行多个渲染步骤。在 `data` 中添加 `passes` 数组：

```typescript
interface NodePass {
  id: string;              // Pass标识符
  name: string;            // Pass显示名称
  glsl: string | string[]; // Pass的GLSL代码。编写时要求使用 string[]（按行写），加载时会 join 成单一字符串；为兼容历史仍接受 string。
  target?: string;         // 'self' | 'output' | 自定义buffer名
  loop?: number;           // 循环次数（配合 #pragma loop）
  
  // Ping-Pong双缓冲配置
  pingPong?: {
    enabled: boolean;
    bufferName?: string;
    initValue?: [number, number, number, number?] | string;
    persistent?: boolean;
    clearEachFrame?: boolean;
  };
}
```

### 5.2 基础Multi-Pass示例

```json
{
  "id": "BLUR_CHAIN",
  "label": "Blur Chain",
  "category": "Filter",
  "data": {
    "passes": [
      {
        "id": "horizontal",
        "name": "Horizontal Blur",
        "target": "self",
        "glsl": [
          "void run(vec2 uv, sampler2D input, out vec4 color) {",
          "  /* 水平模糊 */",
          "}"
        ]
      },
      {
        "id": "vertical",
        "name": "Vertical Blur",
        "target": "self",
        "glsl": [
          "void run(vec2 uv, out vec4 color) {",
          "  /* 垂直模糊：直接用 u_prevPass（无需在参数里声明） */",
          "  color = texture(u_prevPass, uv);",
          "}"
        ]
      }
    ],
    "glsl": [
      "void run(vec2 uv, out vec4 color) {",
      "  color = texture(u_prevPass, uv);",
      "}"
    ],
    "inputs": [
      { "id": "input", "name": "Input", "type": "sampler2D" }
    ],
    "outputs": [
      { "id": "result", "name": "Result", "type": "vec4" }
    ],
    "outputType": "vec4"
  }
}
```

### 5.3 Pass依赖引用 (代码优先)

**🎯 核心特性**: 系统会自动扫描 GLSL 代码中的特定变量名（如 `u_pass_*`, `u_prevPass` 等）来识别 pass 依赖。

**💡 重要提示**: 你**不需要**在 `run` 函数的参数列表中显式声明这些变量。编译器会自动在 Shader 头部注入对应的 `uniform sampler2D` 声明。你可以直接在代码中使用它们。

#### 三种引用方式

**1. `u_prevPass` - 引用上一个pass**
```glsl
void run(vec2 uv, out vec4 color) {
    // 直接使用，无需在 run 参数中声明
    color = texture(u_prevPass, uv);
}
```

**2. `u_pass_<passId>` - 引用特定pass**
```glsl
void run(vec2 uv, out vec4 color) {
    // 假设存在 id 为 "seed" 和 "blur" 的 pass
    vec4 seedData = texture(u_pass_seed, uv);
    vec4 blurData = texture(u_pass_blur, uv);
    color = mix(seedData, blurData, 0.5);
}
```

**3. `u_firstPass` - 引用第一个pass**
```glsl
void run(vec2 uv, out vec4 color) {
    vec4 original = texture(u_firstPass, uv);
    vec4 processed = texture(u_prevPass, uv);
    float diff = length(processed - original);
    color = vec4(vec3(diff), 1.0);
}
```

#### 完整示例：SDF Generator
```json
{
  "id": "SDF_GENERATOR",
  "data": {
    "passes": [
      {
        "id": "seed",
        "glsl": "void run(vec2 uv, sampler2D mask, out vec4 color) { /* 初始化 */ }"
      },
      {
        "id": "step_256",
        "glsl": "void run(vec2 uv, out vec4 color) { /* 使用 u_prevPass */ }"
      },
      {
        "id": "step_1",
        "glsl": "void run(vec2 uv, out vec4 color) { /* 使用 u_prevPass */ }"
      }
    ],
    "glsl": "void run(vec2 uv, int mode, out vec4 color) {\n    // 直接引用特定 pass，无需在参数中声明 u_pass_step_1\n    vec4 data = texture(u_pass_step_1, uv);\n    // ... 计算SDF\n}",
    "inputs": [
      { "id": "mask", "name": "Mask", "type": "sampler2D" },
      { "id": "mode", "name": "Mode", "type": "int" }
    ],
    "outputs": [
      { "id": "result", "name": "SDF", "type": "float" }
    ],
    "outputType": "float"
  }
}
```

**⚠️ 自动过滤机制**:
- 如果你在 `run` 参数中声明了这些变量，系统会自动将它们从 UI 输入面板中过滤掉。
- 建议**不声明**，以保持 `run` 函数签名简洁，仅保留真正的外部输入（如 `mask`, `mode`）。

---

## 6. Ping-Pong 双缓冲

### 6.1 通过Pragma启用

在pass的GLSL代码中使用 `#pragma pingpong`:

```json
{
  "id": "trail_effect",
  "data": {
    "passes": [
      {
        "id": "feedback",
        "target": "self",
        "glsl": "#pragma pingpong\nvoid run(vec2 uv, sampler2D input, out vec4 color) {\n    vec4 current = texture(input, uv);\n    vec4 previous = texture(u_previousFrame, uv);\n    color = mix(previous * 0.95, current, 0.1);\n}"
      }
    ],
    "glsl": "void run(vec2 uv, out vec4 color) { color = texture(u_prevPass, uv); }"
  }
}
```

### 6.2 高级Pragma配置

```glsl
#pragma pingpong                        // 启用双缓冲
#pragma pingpong_init black             // 初始颜色: black/white/transparent
#pragma pingpong_init 1.0,0.0,0.0,1.0   // 自定义RGBA
#pragma pingpong_clear                  // 每帧清除
#pragma pingpong_temporary              // 非持久化
```

### 6.3 自动检测

如果GLSL代码使用了 `u_previousFrame`，系统会**自动启用**ping-pong（无需pragma）:

```glsl
void run(vec2 uv, sampler2D input, out vec4 color) {
    // 自动启用ping-pong，且 u_previousFrame 无需在参数中声明
    color = mix(texture(u_previousFrame, uv), texture(input, uv), 0.1);
}
```

### 6.4 JSON显式配置（可选）

也可以在JSON中显式配置ping-pong（但推荐使用pragma）:

```json
{
  "passes": [
    {
      "id": "feedback",
      "target": "self",
      "pingPong": {
        "enabled": true,
        "bufferName": "trail_buffer",
        "initValue": [0, 0, 0, 1],
        "persistent": true,
        "clearEachFrame": false
      },
      "glsl": "void run(vec2 uv, sampler2D input, sampler2D u_previousFrame, out vec4 color) { ... }"
    }
  ]
}
```

**⚠️ 注意**: `u_previousFrame` 不会显示在UI输入面板，它是系统内部uniform。

---

## 7. Loop 循环渲染

### 7.1 使用 #pragma loop

在pass中使用 `#pragma loop N` 执行N次迭代：

**系统注入的迭代信息（可用于“每次迭代参数不同”的算法）**

- `uniform int u_loopIndex;`：当前迭代索引（从 0 开始）
- `uniform int u_loopCount;`：总迭代次数（等于 N）

```json
{
  "id": "iterative_process",
  "data": {
    "passes": [
      {
        "id": "iteration",
        "target": "self",
        "glsl": "#pragma loop 10\nvoid run(vec2 uv, sampler2D u_prevPass, out vec4 color) {\n    vec4 data = texture(u_prevPass, uv);\n    color = data * 1.05; // 逐步增强\n}"
      }
    ],
    "glsl": "void run(vec2 uv, sampler2D u_prevPass, out vec4 color) { color = texture(u_prevPass, uv); }"
  }
}
```

### 7.2 JSON显式配置（可选）

也可以在JSON中设置 `loop` 字段：

```json
{
  "passes": [
    {
      "id": "iteration",
      "target": "self",
      "loop": 10,
      "glsl": "void run(vec2 uv, sampler2D u_prevPass, out vec4 color) { ... }"
    }
  ]
}
```

### 7.3 结合Ping-Pong和Loop

```json
{
  "passes": [
    {
      "id": "simulation",
      "target": "self",
      "glsl": "#pragma pingpong\n#pragma loop 20\nvoid run(vec2 uv, sampler2D input, sampler2D u_previousFrame, out vec4 color) {\n    // 20次迭代 + 帧间累积\n    vec4 current = texture(input, uv);\n    vec4 history = texture(u_previousFrame, uv);\n    color = mix(history, current, 0.05);\n}"
    }
  ]
}
```

---

## 8. 完整Multi-Pass示例

### 8.1 带依赖的复杂处理链

```json
{
  "id": "COMPLEX_FILTER",
  "label": "Complex Filter",
  "category": "Filter",
  "data": {
    "passes": [
      {
        "id": "preprocess",
        "name": "Preprocess",
        "target": "self",
        "glsl": "void run(vec2 uv, sampler2D input, out vec4 color) {\n    // 预处理\n    color = texture(input, uv) * 1.2;\n}"
      },
      {
        "id": "blur",
        "name": "Blur",
        "target": "self",
        "glsl": "void run(vec2 uv, sampler2D u_prevPass, out vec4 color) {\n    // 模糊处理\n    color = texture(u_prevPass, uv);\n}"
      },
      {
        "id": "enhance",
        "name": "Enhance",
        "target": "self",
        "glsl": "void run(vec2 uv, sampler2D u_pass_preprocess, sampler2D u_prevPass, out vec4 color) {\n    // 结合原始预处理和模糊结果\n    vec4 original = texture(u_pass_preprocess, uv);\n    vec4 blurred = texture(u_prevPass, uv);\n    color = original + (original - blurred) * 0.5;\n}"
      }
    ],
    "glsl": "void run(vec2 uv, sampler2D u_prevPass, float strength, out vec4 color) {\n    color = texture(u_prevPass, uv) * strength;\n}",
    "inputs": [
      { "id": "input", "name": "Input", "type": "sampler2D" },
      { "id": "strength", "name": "Strength", "type": "float" }
    ],
    "outputs": [
      { "id": "result", "name": "Result", "type": "vec4" }
    ],
    "outputType": "vec4",
    "uniforms": {
      "strength": {
        "type": "float",
        "value": 1.0,
        "widget": "slider",
        "widgetConfig": { "min": 0, "max": 2, "step": 0.01 }
      }
    }
  }
}
```

### 8.2 JFA算法示例（Jump Flooding）

```json
{
  "id": "JFA_DISTANCE",
  "data": {
    "passes": [
      {
        "id": "seed",
        "glsl": "void run(vec2 uv, sampler2D mask, out vec4 color) {\n    float m = texture(mask, uv).r;\n    color = (m > 0.5) ? vec4(uv, 0, 1) : vec4(-1, -1, 0, 1);\n}"
      },
      {
        "id": "jump_256",
        "glsl": "#define STEP 256.0\nvoid run(vec2 uv, sampler2D u_prevPass, out vec4 color) {\n    // JFA步骤代码...\n}"
      },
      {
        "id": "jump_128",
        "glsl": "#define STEP 128.0\nvoid run(vec2 uv, sampler2D u_prevPass, out vec4 color) { ... }"
      }
      // ... 更多JFA步骤 ...
    ],
    "glsl": "void run(vec2 uv, sampler2D u_pass_jump_1, out vec4 color) {\n    // 计算距离场\n    vec4 data = texture(u_pass_jump_1, uv);\n    vec2 nearest = data.xy;\n    float dist = distance(uv, nearest);\n    color = vec4(vec3(dist), 1.0);\n}",
    "inputs": [
      { "id": "mask", "name": "Mask", "type": "sampler2D" }
    ]
  }
}
```

---

## 9. 最佳实践总结

### ✅ 推荐做法

1. **使用语义化的Pass ID**
   ```json
   { "id": "blur", "name": "Blur Pass" }
   { "id": "sharpen", "name": "Sharpen Pass" }
   ```

2. **优先使用Pragma配置**
   ```glsl
   #pragma pingpong
   #pragma loop 5
   ```

3. **通过参数名声明依赖**
   ```glsl
   void run(vec2 uv, sampler2D u_pass_blur, out vec4 color) { ... }
   ```

4. **合理组织Pass顺序**
   - 按处理流程排列
   - 第一个pass处理外部输入
   - 后续pass使用 `u_prevPass` 或 `u_pass_<id>`

### ❌ 避免的错误

1. **不要手动声明pass依赖uniform**
   ```glsl
   uniform sampler2D u_pass_blur; // ❌ 不需要！系统自动注入
   ```

2. **不要将内部参数添加到inputs**
   ```json
   "inputs": [
     { "id": "u_prevPass", "type": "sampler2D" } // ❌ 系统会自动过滤
   ]
   ```

3. **避免循环依赖**
   ```glsl
   // Pass A 依赖 Pass B
   // Pass B 依赖 Pass A  // ❌ 会导致编译错误
   ```

4. **不要过度使用特定pass引用**
   ```glsl
   // ❌ 如果只需要上一个pass，用 u_prevPass 更清晰
   void run(vec2 uv, sampler2D u_pass_previous_step_name, out vec4 color) { ... }
   
   // ✅ 推荐
   void run(vec2 uv, sampler2D u_prevPass, out vec4 color) { ... }
   ```

---

## 10. 参考文档

详细文档和高级用法请查看：

- **GLSL开发规范**: `nodes/library/GLSL_SPEC.md`
- **Pass依赖完整指南**: `docs/PASS_DEPENDENCY_GUIDE.md`
- **快速入门**: `docs/PASS_DEPENDENCY_QUICKSTART.md`
- **Ping-Pong设计文档**: `docs/PING_PONG_DESIGN.md`
- **Multi-Pass Loop指南**: `docs/MULTI_PASS_LOOP_GUIDE.md`
- **Pragma指令参考**: `docs/GLSL_PRAGMA_GUIDE.md`

---

## 11. 类型定义参考

完整类型定义请查看 `types.ts`:

```typescript
interface NodePass {
  id: string;
  name: string;
  glsl: string | string[];
  target?: string;
  loop?: number;
  pingPong?: {
    enabled: boolean;
    bufferName?: string;
    initValue?: [number, number, number, number?] | string;
    persistent?: boolean;
    clearEachFrame?: boolean;
  };
}

interface ShaderNodeData {
  glsl: string | string[];
  inputs: NodeInput[];
  outputs: NodeOutput[];
  uniforms: Record<string, UniformVal>;
  outputType: GLSLType;
  passes?: NodePass[];  // Multi-Pass支持
  // ...
}
```

