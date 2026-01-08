# NodeFX - 可视化 GLSL Shader 节点编辑器

> 在线直接使用（无需安装）：https://node-fx.com/
>
> GitHub：https://github.com/pshengcode/NodeFX
>
> English README: [README.md](README.md)

NodeFX 是一个运行在浏览器中的、基于节点的可视化 GLSL Shader 编辑器。你可以通过连接模块化节点来构建复杂着色器，并获得实时预览与代码生成。

**说明：**本项目完全使用 AI 制作与构建。

## 📖 使用指南

- 使用说明（中文）：[USER_GUIDE.md](USER_GUIDE.md)

## ✨ 功能特性

- **可视化图编辑器**：基于 React Flow 的拖拽式节点编辑体验。
- **实时编译**：连线与参数变化会即时触发编译与渲染反馈。
- **智能类型推断**：自动识别 GLSL 类型（`float`、`vec2`、`vec3`、`color` 等），并对连接进行校验。
- **丰富节点库**：
  - **数学**：基础运算、三角函数、向量。
  - **生成**：噪声、渐变、图案。
  - **图像处理**：模糊、辉光、颜色调整。
  - **工具**：混合器、逻辑、时间输入。
- **自定义节点**：在节点内编写原生 GLSL 代码，并动态暴露 uniforms。
- **复合节点**：将多个节点组合成可复用的“复合节点”，让图更清爽。
- **高级参数控件系统**：
  - 颜色选择器（RGB/RGBA）
  - 曲线编辑器
  - 渐变编辑器
  - 图片上传
  - **条件显示**：根据其他参数值动态显示/隐藏控件
- **多语言（i18n）**：支持多语言界面与节点翻译数据。
- **导入/导出**：将工程或单个节点保存为 JSON。

## 🚀 快速开始

### 环境要求

- Node.js（推荐 v20 或更高）
- npm 或 yarn

### 安装与运行

1. 克隆仓库：
   ```bash
  git clone https://github.com/pshengcode/NodeFX.git
  cd NodeFX
   ```

2. 安装依赖：
   ```bash
   npm install
   ```

3. 启动开发服务器：
   ```bash
   npm run dev
   ```

4. 在浏览器打开 `http://localhost:3000`（或终端提示的端口）。

### 其他常用命令

- 生产构建：`npm run build`
- 预览生产构建：`npm run preview`
- 运行单元测试：`npm test`

## 📖 使用指南

- 面向使用者的中文指南请见：
  - [USER_GUIDE.md](USER_GUIDE.md)
  -（也可参考：`public/USER_GUIDE.md`）

## 🛠️ 技术栈

- **框架**：React
- **构建**：Vite
- **图编辑**：React Flow
- **语言**：TypeScript
- **样式**：Tailwind CSS

## 🤝 贡献

欢迎提交 PR / Issue。

## 📄 许可证

详见 [LICENSE](LICENSE)。

## 📝 更新日志

详见 [CHANGELOG.md](CHANGELOG.md)。
