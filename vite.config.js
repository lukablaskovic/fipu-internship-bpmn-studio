import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins: [vue()], resolve: { dedupe: ['vue'] }, server: { host: '127.0.0.1', port: 5174, strictPort: true } });
