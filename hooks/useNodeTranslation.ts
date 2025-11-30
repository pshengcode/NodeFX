import { useTranslation } from 'react-i18next';
import { ShaderNodeDefinition } from '../types';

export function useNodeTranslation(nodeDef?: ShaderNodeDefinition, instanceLocales?: Record<string, Record<string, string>>) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  // Helper to translate any string based on node context
  const translate = (text: string) => {
    if (!text) return text;
    
    // 0. Check Instance-specific translations (Highest Priority)
    if (instanceLocales) {
        if (instanceLocales[lang] && instanceLocales[lang][text]) {
            return instanceLocales[lang][text];
        }
        const shortLang = lang.split('-')[0];
        if (instanceLocales[shortLang] && instanceLocales[shortLang][text]) {
            return instanceLocales[shortLang][text];
        }
    }
    
    // 1. Check Node-specific translations
    // We check if the language starts with the key (e.g. 'zh-CN' matches 'zh')
    if (nodeDef?.locales) {
        // Try exact match first
        if (nodeDef.locales[lang] && nodeDef.locales[lang][text]) {
            return nodeDef.locales[lang][text];
        }
        // Try prefix match (e.g. 'zh' for 'zh-CN')
        const shortLang = lang.split('-')[0];
        if (nodeDef.locales[shortLang] && nodeDef.locales[shortLang][text]) {
            return nodeDef.locales[shortLang][text];
        }
    }

    // 2. Fallback to global translation or original text
    // We don't use i18n.t(text) directly as fallback because 'text' might be dynamic user input
    // But for UI labels it's fine.
    return i18n.exists(text) ? t(text) : text;
  };

  return translate;
}
