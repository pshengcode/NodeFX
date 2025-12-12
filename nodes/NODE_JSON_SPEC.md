# Shader Node JSON Specification

本文档详细说明了 Shader 节点 JSON 定义文件的结构。这些 JSON 文件用于定义应用程序中的自定义节点，包括其 GLSL 代码、输入/输出端口、UI 控件以及多语言翻译。

## 根对象结构 (ShaderNodeDefinition)

每个节点定义文件应包含一个 JSON 对象，具有以下字段：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `id` | `string` | 是 | 节点的唯一标识符 (例如: `"VIGNETTE"`, `"BLEND"`)。 |
| `label` | `string` | 是 | 节点在 UI 中显示的默认名称 (英文)。 |
| `category` | `string` | 是 | 节点分类。可选值: `"Source"`, `"Filter"`, `"Math"`, `"Output"`, `"Network"`, `"Custom"`。 |
| `icon` | `string` | 是 | Lucide React 图标名称 (例如: `"Layers"`, `"Aperture"`)。 |
| `description` | `string` | 否 | 节点的简短描述。 |
| `locales` | `object` | 否 | 多语言翻译字典。 |
| `data` | `object` | 是 | 包含节点核心逻辑和数据结构的对象。 |

---

## 1. 多语言支持 (`locales`)

`locales` 对象用于存储节点内部文本的翻译。键是语言代码 (如 `"zh"`), 值是键值对映射。

**结构示例:**
```json
"locales": {
  "zh": {
    "Vignette": "暗角",
    "Intensity": "强度",
    "Color": "颜色",
    "Input Image": "输入图像"
  }
}
```
*   系统会优先查找完全匹配的语言代码 (如 `zh-CN`)，然后查找前缀 (如 `zh`)。
*   翻译的键 (Key) 必须与 `label`、输入/输出的 `name` 完全一致。

---

## 2. 数据对象 (`data`)

`data` 对象定义了节点的运行时行为。

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `glsl` | `string` | 是 | 节点的 GLSL 片段着色器代码。必须包含 `void run(...)` 函数。 |
| `inputs` | `array` | 是 | 输入端口定义列表。 |
| `outputs` | `array` | 否 | 输出端口定义列表 (通常自动推断，但在 JSON 中显式定义更好)。 |
| `uniforms` | `object` | 否 | Uniform 变量的默认值和 UI 控件配置。 |
| `outputType` | `string` | 是 | 主输出的数据类型 (例如 `"vec4"`). |

### 2.1 GLSL 代码 (`glsl`)

GLSL 代码必须定义一个 `run` 函数。函数的参数将自动映射为输入端口。

```glsl
// 示例
void run(vec2 uv, vec4 inputColor, float intensity, out vec4 result) {
    // ... 逻辑
    result = ...;
}
```

### 2.2 输入定义 (`inputs`)

每个输入项的结构：

```json
{
  "id": "intensity",    // 对应 GLSL 函数参数名或 Uniform 名
  "name": "Intensity",  // UI 显示名称 (可被 locales 翻译)
  "type": "float"       // 数据类型: "float", "int", "vec2", "vec3", "vec4", "sampler2D"
}
```

### 2.3 Uniform 配置 (`uniforms`)

定义输入的默认值和 UI 控件类型。键必须与 `inputs` 中的 `id` 对应。

```json
"uniforms": {
  "intensity": {
    "type": "float",
    "value": 0.5,
    "widget": "slider",  // 控件类型
    "widgetConfig": {    // 控件配置
      "min": 0.0,
      "max": 1.0,
      "step": 0.01
    }
  }
}
```

**支持的控件类型 (`widget`):**
*   `default`: 默认输入框
*   `slider`: 滑动条 (需配置 min, max, step)
*   `number`: 数字输入框
*   `toggle`: 开关 (对应 float 0.0/1.0 或 int 0/1)
*   `color`: 颜色选择器 (对应 vec3 或 vec4)
*   `image`: 图片上传 (对应 sampler2D)
*   `gradient`: 渐变编辑器 (对应 sampler2D)
*   `curve`: 曲线编辑器 (对应 sampler2D)
*   `enum`: 下拉菜单 (需配置 enumOptions)
*   `hidden`: 隐藏控件

### 2.4 条件可见性 (`visibleIf`)

`widgetConfig` 中可以包含 `visibleIf` 对象，用于根据其他 Uniform 的值动态显示或隐藏当前控件。

**结构:**
```json
"visibleIf": {
  "uniform": "target_uniform_id", // 目标 Uniform 的 ID
  "value": 1,                     // (可选) 当目标值等于此值(或在数组中)时显示。支持数字或数字数组。
  "notValue": 0                   // (可选) 当目标值不等于此值(或不在数组中)时显示。支持数字或数字数组。
}
```
*注意: `value` 和 `notValue` 通常只使用其中一个。*

**示例:**
```json
// 单值匹配
"visibleIf": { "uniform": "mode", "value": 0 }

// 多值匹配 (数组支持)
"visibleIf": { "uniform": "mode", "value": [1, 2] } // 当 mode 为 1 或 2 时显示
```

**示例:**
```json
"radius": {
  "type": "float",
  "widgetConfig": {
    "visibleIf": {
      "uniform": "shape_type",
      "value": 0 // 仅当 shape_type 为 0 时显示
    }
  }
}
```

---

## 完整示例 (Vignette 节点)

```json
{
  "id": "VIGNETTE",
  "label": "Vignette",
  "category": "Filter",
  "icon": "Aperture",
  "description": "Adds a dark border around the image",
  "locales": {
    "zh": {
      "Vignette": "暗角",
      "Input": "输入",
      "Intensity": "强度",
      "Smoothness": "平滑度",
      "Color": "颜色"
    }
  },
  "data": {
    "glsl": "void run(vec2 uv, vec4 input, float intensity, float smoothness, vec3 color, out vec4 result) {\n    vec2 center = uv - 0.5;\n    float dist = length(center);\n    float vig = smoothstep(intensity, intensity - smoothness, dist);\n    result = vec4(mix(color, input.rgb, vig), input.a);\n}",
    "outputType": "vec4",
    "inputs": [
      { "id": "input", "name": "Input", "type": "vec4" },
      { "id": "intensity", "name": "Intensity", "type": "float" },
      { "id": "smoothness", "name": "Smoothness", "type": "float" },
      { "id": "color", "name": "Color", "type": "vec3" }
    ],
    "outputs": [
      { "id": "result", "name": "Output", "type": "vec4" }
    ],
    "uniforms": {
      "intensity": {
        "type": "float",
        "value": 0.5,
        "widget": "slider",
        "widgetConfig": { "min": 0, "max": 1.5, "step": 0.01 }
      },
      "smoothness": {
        "type": "float",
        "value": 0.5,
        "widget": "slider",
        "widgetConfig": { "min": 0, "max": 1, "step": 0.01 }
      },
      "color": {
        "type": "vec3",
        "value": [0, 0, 0],
        "widget": "color"
      }
    }
  }
}
```

## 3. ���������� UI ѡ�� (Overloads)

GLSL ����֧�ֶ����� run ���������أ���ϵͳ���Զ��������� run ����ǩ����

Ϊ���� UI ���ṩ�Ѻõ�����ѡ����������ʹ���Զ���Ԥ����ָ�� //[Item(Label, Order)] ���ÿ�� run ������

**�﷨:**
\\\glsl
//[Item("��ʾ����", ����Ȩ��)]
void run(...) { ... }
\\\

**ʾ��:**
\\\glsl
// Output: Float
//[Item(FloatOutput, 0)]
void run(vec4 input, out float result) { ... }

// Output: Vec4
//[Item(Vec4Output, 1)]
void run(vec4 input, out vec4 result) { ... }
\\\

*   **Label**: �����˵�����ʾ�����ơ�
*   **Order**: ����Ȩ�أ�����ԽСԽ��ǰ����
*   ���δ�ṩ��ǣ�UI ����ʾĬ�ϵ�ǩ���б���

