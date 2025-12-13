/// <reference types="vitest" />
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import obfuscator from 'rollup-plugin-obfuscator';

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';

    const getVendorChunkName = (id: string): string | null => {
      const index = id.lastIndexOf('node_modules/');
      if (index === -1) return null;
      const rest = id.slice(index + 'node_modules/'.length);
      const parts = rest.split('/');
      if (parts.length === 0) return null;
      const isScoped = parts[0].startsWith('@');
      const pkg = isScoped && parts.length >= 2 ? `${parts[0]}/${parts[1]}` : parts[0];
      return pkg
        .replace(/^@/, '')
        .replace(/[\\/]/g, '_');
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      build: {
        chunkSizeWarningLimit: 600, // Increase limit as we have code-split large components
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules/')) return;

              // keep a few high-impact libs stable
              if (id.includes('node_modules/reactflow/')) return 'vendor_reactflow';
              if (id.includes('node_modules/@monaco-editor/')) return 'vendor_monaco';
              if (id.includes('node_modules/monaco-editor/')) return 'vendor_monaco';
              if (id.includes('node_modules/react-dom/')) return 'vendor_react';
              if (id.includes('node_modules/react/')) return 'vendor_react';

              const pkg = getVendorChunkName(id);
              return pkg ? `vendor_${pkg}` : 'vendor';
            },
          },
        },
      },
      plugins: [
        tailwindcss(),
        react(),
        isProd && obfuscator({
          global: true,
          options: {
            // 压缩代码
            compact: true,
            // 控制流扁平化 (降低性能，但极大增加阅读难度) - 设为 false 以保证图形应用性能
            controlFlowFlattening: false, 
            // 变量名混淆
            identifierNamesGenerator: 'hexadecimal',
            // 字符串加密 (轻量级)
            stringArray: true,
            stringArrayEncoding: ['rc4'],
            stringArrayThreshold: 0.75,

            // 关键：不要混淆 import / dynamic import。
            // 否则可能会破坏 Vite/Rollup 在构建末尾对 chunk 文件名 hash placeholder 的替换，
            // 导致运行时请求到形如 `CustomNode-!~{00z}~.js` 的不存在资源。
            ignoreImports: true,
            reservedStrings: ['!~\\{[0-9a-zA-Z]+\\}~'],
            // 防止格式化
            selfDefending: true,
            // 禁用控制台输出 (防止用户调试)
            disableConsoleOutput: true,
            // 僵尸代码注入 (增加体积，增加混淆度)
            deadCodeInjection: false,
          }
        })
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
