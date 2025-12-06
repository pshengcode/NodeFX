/// <reference types="vitest" />
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import obfuscator from 'rollup-plugin-obfuscator';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isProd = mode === 'production';

    return {
      test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
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
            // 防止格式化
            selfDefending: true,
            // 禁用控制台输出 (防止用户调试)
            disableConsoleOutput: true,
            // 僵尸代码注入 (增加体积，增加混淆度)
            deadCodeInjection: false,
          }
        })
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
