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
