# GLSL 节点开发简明规范

## 1. 核心入口
必须定义 `run` 函数，系统自动处理重命名。
```glsl
//vec2 uv 参数时必须的并且一定时第一个参数
void run(vec2 uv, float input1, ..., out vec4 output1) { ... }
```

## 2. 函数与变量
*   **自定义函数**: 支持定义辅助函数，支持重载。系统自动重命名防冲突。
*   **全局变量**: 支持 `const` 和全局变量（自动重命名）。
*   **无状态**: GLSL 是无状态的，全局变量无法跨帧保存数据。

## 3. Uniforms (参数)
*   **禁止手动声明**: 不要在代码写 `uniform float x;`。
*   **JSON 定义**: 在节点 JSON 的 `uniforms` 字段定义。
*   **直接使用**: 代码中直接使用 JSON 定义的变量名（如 `u_speed`）。

## 4. 内置变量
*   `u_time` (float): 时间(秒)
*   `u_resolution` (vec2): 画布尺寸

## 5. 限制
*   ❌ 禁止定义 `main()`
*   ❌ 避免复杂预处理 (`#define`)
*   ✅ 使用 WebGL 2.0 语法 (用 `texture()` 替代 `texture2D`)

---

## 6. Multi-Pass 渲染

### 6.1 基础概念
Multi-Pass允许一个节点执行多个渲染步骤，每个pass的输出可以作为下一个pass的输入。

### 6.2 定义Pass
在节点JSON的 `passes` 数组中定义：

```json
{
  "data": {
    "passes": [
      {
        "id": "blur",
        "name": "Blur Pass",
        "target": "self",
        "glsl": "void run(vec2 uv, sampler2D input, out vec4 color) { ... }"
      }
    ],
    "glsl": "void run(vec2 uv, sampler2D u_pass_blur, out vec4 color) { ... }"
  }
}
```

### 6.3 Pass依赖引用 (代码优先)

**🎯 核心理念**: 通过函数参数名称直接声明依赖，无需JSON配置。

#### 三种引用方式

1. **`u_prevPass`** - 引用上一个pass
```glsl
void run(vec2 uv, sampler2D u_prevPass, out vec4 color) {
    color = texture(u_prevPass, uv) * 1.5;
}
```

2. **`u_pass_<passId>`** - 引用特定pass
```glsl
void run(vec2 uv, sampler2D u_pass_seed, out vec4 color) {
    color = texture(u_pass_seed, uv);
}
```

3. **`u_firstPass`** - 引用第一个pass
```glsl
void run(vec2 uv, sampler2D u_firstPass, out vec4 color) {
    color = texture(u_firstPass, uv);
}
```

#### 多重依赖示例
```glsl
void run(vec2 uv,
         sampler2D mask,           // 外部输入 - 会显示在UI
         sampler2D u_pass_seed,    // pass依赖 - 不显示在UI
         sampler2D u_prevPass,     // pass依赖 - 不显示在UI
         int mode,                 // 外部输入 - 会显示在UI
         out vec4 color) {
    vec4 seedData = texture(u_pass_seed, uv);
    vec4 prevData = texture(u_prevPass, uv);
    vec4 maskData = texture(mask, uv);
    // 混合多个数据源...
}
```

**⚠️ 重要**: Pass依赖参数（`u_pass_*`、`u_prevPass`、`u_firstPass`）**不会**显示在UI面板上，它们是系统内部使用的。

---

## 7. Ping-Pong 双缓冲

### 7.1 基础用法
在pass中使用 `#pragma pingpong` 启用双缓冲：

```glsl
#pragma pingpong
void run(vec2 uv, sampler2D input, sampler2D u_previousFrame, out vec4 color) {
    vec4 current = texture(input, uv);
    vec4 previous = texture(u_previousFrame, uv);
    
    // 创建运动轨迹效果
    color = mix(previous * 0.95, current, 0.1);
}
```

### 7.2 高级Pragma指令

```glsl
#pragma pingpong                    // 启用ping-pong
#pragma pingpong_init black         // 初始颜色: black/white/transparent
#pragma pingpong_init 1.0,0.0,0.0,1.0  // 自定义RGBA
#pragma pingpong_clear              // 每帧清除缓冲
#pragma pingpong_temporary          // 非持久化缓冲
```

### 7.3 自动检测
如果代码中使用了 `u_previousFrame`，系统会**自动启用**ping-pong：

```glsl
void run(vec2 uv, sampler2D input, sampler2D u_previousFrame, out vec4 color) {
    // 不需要 #pragma pingpong，自动检测
    color = mix(texture(u_previousFrame, uv), texture(input, uv), 0.1);
}
```

**⚠️ 重要**: `u_previousFrame` 不会显示在UI面板上，它是系统内部uniform。

---

## 8. Loop循环渲染

### 8.1 使用 #pragma loop
在pass中使用 `#pragma loop N` 执行N次迭代：

```glsl
#pragma loop 5
void run(vec2 uv, sampler2D u_prevPass, out vec4 color) {
    // 这段代码会执行5次
    // 第一次: u_prevPass = 外部输入
    // 后续: u_prevPass = 上一次迭代的输出
    vec4 data = texture(u_prevPass, uv);
    color = data * 1.1; // 逐步增强
}
```

### 8.2 结合Ping-Pong
```glsl
#pragma pingpong
#pragma loop 10
void run(vec2 uv, sampler2D input, sampler2D u_previousFrame, out vec4 color) {
    // 创建复杂的时间累积效果
    vec4 current = texture(input, uv);
    vec4 history = texture(u_previousFrame, uv);
    color = mix(history, current, 0.05);
}
```

---

## 9. 完整示例：SDF Generator

```json
{
  "data": {
    "passes": [
      {
        "id": "seed",
        "glsl": "void run(vec2 uv, sampler2D mask, out vec4 color) { ... }"
      },
      {
        "id": "step_256",
        "glsl": "void run(vec2 uv, sampler2D u_prevPass, out vec4 color) { ... }"
      },
      {
        "id": "step_1",
        "glsl": "void run(vec2 uv, sampler2D u_prevPass, out vec4 color) { ... }"
      }
    ],
    "glsl": "void run(vec2 uv, sampler2D u_pass_step_1, int mode, out vec4 color) {\n    // 直接引用最后一个JFA步骤的结果\n    vec4 data = texture(u_pass_step_1, uv);\n    // ... 计算SDF\n}"
  }
}
```

**说明**:
- ✅ Seed pass从mask输入读取
- ✅ 中间步骤使用 `u_prevPass` 形成处理链
- ✅ 最终pass使用 `u_pass_step_1` 直接获取结果
- ✅ 编译器自动处理执行顺序和纹理绑定

---

## 10. 最佳实践

### ✅ 推荐
```glsl
// 1. 使用语义化的pass ID
{ "id": "blur", "glsl": "..." }

// 2. 通过参数名声明依赖
void run(vec2 uv, sampler2D u_pass_blur, out vec4 color) { ... }

// 3. 结合pragma和代码
#pragma pingpong
#pragma loop 3
void run(vec2 uv, sampler2D u_prevPass, sampler2D u_previousFrame, ...) { ... }
```

### ❌ 避免
```glsl
// 1. 不要手动声明pass依赖uniform
uniform sampler2D u_pass_blur; // ❌ 不需要！

// 2. 不要将内部参数暴露为外部输入
{ "inputs": [{ "id": "u_prevPass", ... }] } // ❌ 系统会自动过滤

// 3. 避免过深的依赖链
void run(sampler2D u_pass_a, u_pass_b, u_pass_c, u_pass_d, ...) // ❌ 太复杂
```

---

## 11. 参考文档

详细文档请查看：
- **Pass依赖完整指南**: `docs/PASS_DEPENDENCY_GUIDE.md`
- **快速入门**: `docs/PASS_DEPENDENCY_QUICKSTART.md`
- **Ping-Pong设计**: `docs/PING_PONG_DESIGN.md`
- **Loop使用**: `docs/MULTI_PASS_LOOP_GUIDE.md`
- **Pragma指令**: `docs/GLSL_PRAGMA_GUIDE.md`
