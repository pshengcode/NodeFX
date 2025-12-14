## [1.2.6] - 2025-12-14

Feature: Update the flow simulation and population system nodes to standardize the output, add a hybrid normal node.
feat: 更新流体模拟和粒子系统节点以规范输出，添加混合法线节点

## [1.2.5] - 2025-12-14

feat: Added support for "Clamp UV" input and updated GLSL logic
feat: 添加对“Clamp UV”输入的支持并更新GLSL逻辑

## [1.2.4] - 2025-12-13

feat: Added user guide and updated sidebar buttons and internationalized text.
feat: 添加用户指南并更新侧边栏按钮和国际化文本

## [1.2.3] - 2025-12-13

Fix: Update node definition to 'SAMP_TEXTURE' to fix image processing logic.
fix: 更新节点定义为'SAMP_TEXTURE'以修复图像处理逻辑

## [1.2.2] - 2025-12-13

feat: 添加对动态导入的忽略配置以防止构建错误

## [1.2.1] - 2025-12-13

- Updated glslParser.test.ts to preserve metadata directives in line comments and read label/order from //Item directives.
- Modified glslParser.ts to support new metadata directive formats and adjust default order handling.
- Enhanced graphUtils.ts to calculate effective positions for cloned nodes, considering parent group relationships.
- 更新了 glslParser.test.ts，以保留行注释中的元数据指令，并从 //Item 指令中读取标签/顺序。
- 修改了 glslParser.ts，以支持新的元数据指令格式并调整默认顺序处理。
- 增强了 graphUtils.ts，以计算克隆节点的有效位置，并考虑父组关系。

## [1.2.0] - 2025-12-13

Refactor shader nodes and improve texture handling
- Updated GLSL functions in clamp, curves, displacement, fluid simulation, image loader, mod, particle system, rgb offset, smoothstep, texture lod, texture size, and twist nodes for better clarity and consistency.
- Removed the image loader node as it is no longer needed.
- Changed the uniform type for 'b' in mod node from float to vec4.
- Enhanced fluid simulation node output identifiers for clarity.
- Added support for alpha channel in curve texture generation and handling.
- Introduced a new utility for managing uniform overrides in shaders.
- Implemented an empty texture to prevent stale sampling in WebGL.
- Improved texture upload logic to handle updates without creating new WebGLTexture objects.
- Updated package.json to include a validation script for nodes.
- Modified types and schemas to accommodate new curve points for alpha channel.
重构着色器节点并改进纹理处理
- 更新了 clamp、curves、deplacement、fluid simulation、image loader、mod、particle system、rgb offset、smoothstep、texture lod、texture size 和 twist 节点中的 GLSL 函数，以提高清晰度和一致性。
- 移除了 image loader 节点，因为它不再需要。
- 将 mod 节点中 'b' 的 uniform 类型从 float 更改为 vec4。
- 增强了 fluid simulation 节点的输出标识符，使其更加清晰。
- 在曲线纹理的生成和处理中添加了对 alpha 通道的支持。
- 引入了一个用于管理着色器中 uniform 覆盖的新实用程序。
- 实现了一个空纹理，以防止 WebGL 中出现过时的采样。
- 改进了纹理上传逻辑，使其能够在不创建新的 WebGLTexture 对象的情况下处理更新。
- 更新了 package.json 文件，添加了节点验证脚本。
- 修改了类型和模式，以适应 alpha 通道的新曲线点。

## [1.1.4] - 2025-12-12

feat: 增强性能监控面板 / Enhanced performance monitoring panel
Performance Stats / 性能统计:
- Add compilation stats (total compiles, errors, compile time) / 添加编译统计（总次数、错误数、耗时）
- Add WebGL resource tracking (programs, textures, FBOs, cleanup time) / 添加 WebGL 资源追踪（程序、纹理、FBO、清理时间）
- Add memory usage display (Chrome only) / 添加内存使用显示（仅 Chrome）
- Add node type distribution (particle, fluid, network) / 添加节点类型分布统计
- Add undo/redo stack size tracking / 添加撤销/重做栈大小追踪
Features / 功能:
- Support ?debug URL parameter to show stats in production / 支持 ?debug URL 参数在生产环境显示统计
- Real-time WebGL resource monitoring / 实时 WebGL 资源监控
- Compilation performance tracking / 编译性能追踪
Bug Fixes / 问题修复:
- Fix null value warning in ParticleSystemNode select elements / 修复粒子系统节点 select 元素的 null 值警告

## [1.1.3] - 2025-12-12

feat: Add Bevel & Emboss node with GLSL implementation and localization
- Introduced a new node for Bevel & Emboss effects, including various styles and parameters.
- Added localization support for Chinese.
- Implemented GLSL functions for blending modes and embossing effects.
refactor: Change Blend node category from Composite to Color
- Updated the category of the Blend node to better reflect its functionality.
- Modified the input types from sampler2D to vec4 for background and foreground.
feat: Introduce Swizzle node for rearranging vector components
- Added a new Swizzle node that allows users to rearrange the components of a vector.
- Implemented various output types (Float, Vec2, Vec3, Vec4) based on user selection.
test: Add performance tests for CustomNode rendering optimization
- Created tests to ensure CustomNode components are memoized and only re-render when necessary.
- Verified that changes in position do not trigger unnecessary re-renders.
feat: Extend types with CanvasTemplate and LibraryItem union
- Added a new CanvasTemplate interface for saving entire canvas states.
- Created a union type LibraryItem to encompass both ShaderNodeDefinition and CanvasTemplate.
fix: Enhance GLSL parser to support additional types and metadata directives
- Updated the VALID_TYPES set to include more GLSL types (e.g., uint, mat2, samplerCube).
- Improved comment stripping to preserve metadata directives.
- Enhanced signature extraction to handle new label and order attributes.
fix: Update inference helpers and schemas for new GLSL types
- Modified sanitizeType function to recognize new GLSL types.
- Updated GLSLTypeSchema to include additional types for validation.
chore: Add empty cube texture uniform for shader compatibility
- Introduced a new uniform samplerCube for compatibility with Shadertoy shaders.
feat: 添加斜面与浮雕（Bevel & Emboss）节点并实现 GLSL 与本地化
- 引入用于斜面与浮雕效果的新节点，包含多种样式和参数。
- 添加中文本地化支持。
- 实现用于混合模式与浮雕效果的 GLSL 函数。
refactor: 将 Blend 节点类别从 Composite 更改为 Color
- 更新 Blend 节点的类别以更准确地反映其功能。
- 将背景和前景的输入类型从 sampler2D 修改为 vec4。
feat: 引入用于重排列向量分量的 Swizzle 节点
- 添加新的 Swizzle 节点，允许用户重排列向量的分量。
- 根据用户选择实现多种输出类型（Float、Vec2、Vec3、Vec4）。
test: 为 CustomNode 渲染优化添加性能测试
- 创建测试以确保 CustomNode 组件被记忆化（memoized），仅在必要时重新渲染。
- 验证位置变化不会触发不必要的重新渲染。
feat: 扩展类型，新增 CanvasTemplate 接口和 LibraryItem 联合类型
- 添加用于保存整个画布状态的新 CanvasTemplate 接口。
- 创建 LibraryItem 联合类型以包含 ShaderNodeDefinition 和 CanvasTemplate。
fix: 增强 GLSL 解析器以支持更多类型和元数据指令
- 更新 VALID_TYPES 集合以包含更多 GLSL 类型（例如 uint、mat2、samplerCube）。
- 改进注释剥离以保留元数据指令。
- 增强签名提取以处理新的 label 和 order 属性。
fix: 更新推断辅助函数和模式以支持新的 GLSL 类型
- 修改 sanitizeType 函数以识别新增的 GLSL 类型。
- 更新 GLSLTypeSchema 以包含用于验证的额外类型。
chore: 添加用于着色器兼容性的空立方体纹理统一变量
- 引入新的 samplerCube 统一变量以兼容 Shadertoy 着色器。

## [1.1.2] - 2025-12-10

Feature: Updated labels and descriptions for multiple nodes, simplified support widgets for vec3 and vec4, and removed the standard glowing node.
feat: 更新多个节点的标签和描述，简化 vec3 和 vec4 的支持小部件，删除标准发光节点

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
