import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Basic UI translations
const resources = {
  en: {
    common: {
      "Save": "Save",
      "Load": "Load",
      "Reset": "Reset",
      "Share": "Share",
      "Presets": "Presets",
      "Cancel": "Cancel",
      "Merge": "Merge into Current Project",
      "Overwrite": "Overwrite Local Project",
      "Shared Project Detected": "Shared Project Detected",
      "You have unsaved local work. How would you like to proceed?": "You have unsaved local work. How would you like to proceed?",
      "Add shared nodes to your current canvas (Recommended)": "Add shared nodes to your current canvas (Recommended)",
      "Discard local changes and load shared project": "Discard local changes and load shared project",
      "Cancel (Ignore Share Link)": "Cancel (Ignore Share Link)",
      "Are you sure you want to reset the canvas? All unsaved changes will be lost.": "Are you sure you want to reset the canvas? All unsaved changes will be lost.",
      "Share link copied to clipboard!": "Share link copied to clipboard!",
      "Invalid Project File": "Invalid Project File",
      "Failed to parse JSON.": "Failed to parse JSON.",
      "Invalid Node JSON": "Invalid Node JSON"
    }
  },
  zh: {
    common: {
      "Save": "保存",
      "Load": "加载",
      "Reset": "重置",
      "Share": "分享",
      "Presets": "预设",
      "Cancel": "取消",
      "Merge": "合并到当前项目",
      "Overwrite": "覆盖本地项目",
      "Shared Project Detected": "检测到分享的项目",
      "You have unsaved local work. How would you like to proceed?": "您有未保存的本地工作。您希望如何处理？",
      "Add shared nodes to your current canvas (Recommended)": "将分享的节点添加到当前画布（推荐）",
      "Discard local changes and load shared project": "放弃本地更改并加载分享的项目",
      "Cancel (Ignore Share Link)": "取消（忽略分享链接）",
      "Are you sure you want to reset the canvas? All unsaved changes will be lost.": "确定要重置画布吗？所有未保存的更改都将丢失。",
      "Share link copied to clipboard!": "分享链接已复制到剪贴板！",
      "Invalid Project File": "无效的项目文件",
      "Failed to parse JSON.": "JSON 解析失败。",
      "Invalid Node JSON": "无效的节点 JSON",
      "Group": "节点组",
      "Network Sender": "网络发送器",
      "Configure": "配置",
      "Delete": "删除",
      "Network ID": "网络 ID",
      "Connect Input": "连接输入",
      "Download Manually": "手动下载",
      "Server API URL": "服务器 API 地址",
      "HTTPS mismatch": "HTTPS 不匹配",
      "Debounce (ms)": "防抖 (ms)",
      "Force Send Now": "强制立即发送",
      "Test": "测试",
      "Last": "上次",
      "Output Size": "输出尺寸",
      "RGB": "RGB",
      "Alpha": "Alpha",
      "Delete Stop": "删除节点",
      "Search nodes...": "搜索节点...",
      "No nodes found": "未找到节点"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
