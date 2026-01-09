# NodeFX - Visual GLSL Shader Editor

> Use it online (no install): https://node-fx.com/
>
>  [中文](README.zh-CN.md)

NodeFX is a powerful, node-based visual editor for creating GLSL shaders directly in your browser. It allows developers and artists to construct complex shaders by connecting modular nodes, offering real-time preview and code generation.

**Note:** This project was built entirely using AI.

## 📖 User Guide

- User guide (Chinese): [USER_GUIDE.md](USER_GUIDE.md)


## ✨ Features

- **Visual Graph Editor**: Intuitive drag-and-drop interface built with React Flow.
- **Real-time Compilation**: Instant feedback as you connect nodes; the shader compiles and renders on the fly.
- **Smart Type Inference**: Automatic detection of GLSL types (`float`, `vec2`, `vec3`, `color`, etc.) with connection validation.
- **Rich Node Library**:
  - **Math**: Basic arithmetic, trigonometry, vectors.
  - **Generative**: Noise, gradients, patterns.
  - **Image Processing**: Blur, bloom, color adjustments.
  - **Utility**: Mixers, logic, time inputs.
- **Custom Nodes**: Write your own raw GLSL code within a node and expose uniforms dynamically.
- **Compound Nodes**: Group multiple nodes into a single reusable "Compound Node" to keep your graph clean.
- **Advanced Widget System**:
  - Color Pickers (RGB/RGBA)
  - Curve Editors
  - Gradient Editors
  - Image Uploads
  - **Conditional Visibility**: Dynamic UI controls that show/hide based on other parameter values.
- **Localization (i18n)**: Full support for multi-language interfaces, with per-node translation data.
- **Export/Import**: Save your projects or individual nodes to JSON.

## 🚀 Getting Started

### Prerequisites

- Node.js (v20 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/pshengcode/NodeFX.git
   cd NodeFX
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser at `http://localhost:3000` (or the port shown in your terminal).

### Other Scripts

- Build for production: `npm run build`
- Preview production build: `npm run preview`
- Run unit tests: `npm test`

## 📖 Usage Guide

### Basic Editing
- **Add Node**: Right-click on the canvas to open the context menu and select a node category.
- **Connect**: Drag from an output handle to a compatible input handle.
- **Preview**: Click the "Eye" icon on any node to visualize its output on the main canvas.

### Custom Nodes
1. Add a **Custom Code** node.
2. Click the `< >` icon to open the code editor.
3. Write standard GLSL. Define a `void run(...)` function.
4. Inputs and outputs are automatically detected from your function signature.

### Conditional Visibility
You can make a parameter appear only when another parameter meets a condition (e.g., show "Radius" only when "Shape" is "Circle").
1. Open the Node Editor (Settings icon).
2. Go to the **Inputs** tab.
3. Click the **Eye** icon next to the input you want to control.
4. Set the **Depends On** uniform and the **Condition** (Equals/Not Equals).

## 🛠️ Tech Stack

- **Framework**: [React](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Graph Engine**: [React Flow](https://reactflow.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Localization**: i18next

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

See [LICENSE](LICENSE).

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md).
