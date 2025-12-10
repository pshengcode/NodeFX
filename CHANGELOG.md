## [1.1.1] - 2025-12-10

feat: Add new image processing nodes and enhance versioning system
- Introduced new nodes for image processing:
- Blend: Combines two images using various blend modes.
- Height to Normal: Converts grayscale height maps into normal maps.
- Inner Glow: Generates an inner glow effect based on alpha channel.
- Refraction & Dispersion: Simulates glass refraction and chromatic aberration.
- Updated package version to 1.1.1 and added happy-dom for testing.
- Enhanced commit message processing to automatically update version in package.json and appConfig.json based on commit messages.
- Added tests for useUndoRedo hook to ensure performance optimizations and structural hashing behavior.
- Implemented a simple CRC32 hash utility for string processing.
新增功能：新增图像处理节点并增强版本控制系统
- 新增图像处理节点：
- 混合：使用各种混合模式合并两张图像。
- 高度转法线：将灰度高度图转换为法线贴图。
- 内发光：基于 Alpha 通道生成内发光效果。
- 折射与色散：模拟玻璃折射和色差。
- 更新软件包版本至 1.1.1，并添加了 happy-dom 用于测试。
- 增强了提交消息处理，可根据提交消息自动更新 package.json 和 appConfig.json 中的版本。
- 为 useUndoRedo hook 添加了测试，以确保性能优化和结构化哈希行为。
- 实现了一个简单的 CRC32 哈希工具，用于字符串处理。

## [1.1.0] - 2025-12-09

feat: Add DraggableNumberWidget for intuitive number adjustments
- Introduced DraggableNumberWidget component to allow users to drag and edit numeric values.
- Implemented mouse event handlers for drag functionality and keyboard support for editing.
- Enhanced user experience with custom spin buttons for incrementing and decrementing values.
feat: Integrate ParticleSystemNode into Canvas layout
- Registered ParticleSystemNode in the Canvas layout to support particle system functionality.
- Updated nodeTypes to include the new particle system node.
fix: Update useGraphActions to handle particle system node type
- Modified useGraphActions to correctly identify and handle the new particle system node type.
- Ensured compatibility with existing node definitions.
feat: Add particle system node definition
- Created particle_system.json to define the properties and behavior of the Particle System node.
- Included inputs, outputs, and GLSL code for rendering particles.
refactor: Enhance dynamic texture registry for better flexibility
- Updated dynamicRegistry to accept both HTMLCanvasElement and Float32Array data sources.
- Adjusted registerDynamicTexture function to accommodate new data types.
perf: Optimize WebGLSystem for resource management
- Added lastUsed timestamp to programs and FBO cache to manage resource cleanup effectively.
- Implemented cleanup logic to remove unused programs and framebuffers based on last used time.
- Enhanced texture handling to support both canvas and float data uploads.
新增功能：添加 DraggableNumberWidget 组件并集成 ParticleSystemNode
- 实现了 DraggableNumberWidget 组件，可通过拖拽和编辑实现直观的数字调整。
- 增强了 Canvas 布局，将 ParticleSystemNode 包含在 nodeTypes 中。
- 更新了 useGraphActions 以支持新的粒子系统节点类型。
- 创建了 particle_system.json 文件，用于使用 GLSL 和输入/输出规范定义粒子系统节点。
- 修改了 dynamicRegistry 以处理动态纹理源，同时支持 HTMLCanvasElement 和 Float32Array 数据。
- 增强了 WebGLSystem，使用 lastUsed 时间戳管理程序和帧缓冲区生命周期，从而更好地进行资源管理。

## [1.0.33] - 2025-12-06

优化节点选择器以减少拖动时的重新渲染，新增 useOptimizedNodes 自定义钩子；更新 GroupNode、NetworkNode、PaintNode 组件以使用新钩子；添加 GLSL 节点开发规范文档。

## [1.0.31] - 2025-12-06

完善置换节点的输入输出类型
画笔节点修复bug

## [1.0.29] - 2025-12-06

增加示例项目加载功能，完善项目上下文和文件操作逻辑，更新相关翻译和示例数据

## [1.0.27] - 2025-12-06

优化属性编辑菜单的交互。
增大节点的端点可拖拽区域。

## [1.0.25] - 2025-12-06

完善 GLSL 类型支持，增加 uint、bool、uvec、mat 类型，更新相关组件和测试节点

## [1.0.22] - 2025-12-06

完善基础节点:
1.  **`mod.json`** (取模): 支持 float/vec2/vec3/vec4 重载。
2.  **`refract.json`** (折射): 核心光照函数，支持 vec2/vec3。
3.  **`texture_size.json`** (纹理尺寸): 获取纹理像素大小 (vec2)。
4.  **`texture_lod.json`** (纹理 LOD 采样): 指定 Mipmap 级别进行采样。
5.  **`exp.json`** (指数): $e^x$。
6.  **`log.json`** (对数): $\ln(x)$。
7.  **`inversesqrt.json`** (平方根倒数): $1/\sqrt{x}$，常用于向量归一化。
8.  **`trunc.json`** (截断): 向零取整。
9.  **`radians.json`** (角度转弧度)。
10. **`degrees.json`** (弧度转角度)。


## [1.0.19] - 2025-12-06 15:11:24

* 完善前端关于功能 [v1.0.19]
* 版本自动添加changelog
----------------------------------------------
## [1.0.18] - 2025-12-05

增加 流体模拟， 烘焙gif 视频 序列帧

## [1.0.17] - 2025-12-04

新增支持类下 vec2 数组，并增加网格编辑器 升级曲线编辑器 支持rgb分别调整 增加网格扭曲节点 增加曲线调节节点 增加 两个序列帧相关节点 增加染色节点 修复 preview 中图像高度缺失的问题 修改 色彩映射 曲线 编辑器生成的图的重复模式为 clamp

## [1.0.16] - 2025-12-03

修复 复制节点 静态变量 不会被重名的问题， 修复组节点的glsl保存后会被重新编译的问题，修复不能预览组节点的问题，增加节点粗糙边缘，现在自动推断重载对于当前 显示的重载分数更高，会更优先选择当前重载。

## [1.0.15] - 2025-12-03

重要功能：新增内置贴图资源功能，可以选取内置资源而不需要本地资源。 新增png修复节点

## [1.0.14] - 2025-12-03

优化 有bug的节点， 尝试解决 刷新浏览器 可能会丢失节点的问题

## [1.0.13] - 2025-12-03

修正wrangler.json位置

## [1.0.12] - 2025-12-03

CF 的部署配置wrangler.json

## [1.0.11] - 2025-12-03

修改去黑逻辑，修改导出文件后缀

## [1.0.10] - 2025-12-03

增加节点 马赛克 溶解 膨胀收缩。颜色修改器 增加防抖

## [1.0.9] - 2025-12-02

优化侧边栏交互， 优化一些 节点参数 增加 色彩映射， 色阶节点

## [1.0.8] - 2025-12-02

X 增加 切换 重载功能， 修复 右键菜单不能搜索中文的问题，修复 多pass 变量名重复的问题

## [1.0.7] - 2025-12-02

新增 节点 三个 noise ddx ddy 查找边缘，边缘渐变， 去黑，场景信息 旋转扭曲 uv

## [1.0.6] - 2025-12-02

修复单元测试过不了bug，极坐标增加 贴图重载

## [1.0.5] - 2025-12-02

增加spliat节点， 类型判端 函数重载 重新 搞了一下， 新增 全局变量概念。

## [1.0.4] - 2025-12-01

完善分类 细化分类， 修改一部分节点的分类属性
