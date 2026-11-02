import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { modelApi } from './model-api.mjs';
const directory = process.env.BPMN_MODELS_DIR || fileURLToPath(new URL('../python-bpmn-engine/models', import.meta.url));
const models = { name: 'praksa-model-source', configureServer(server) { server.middlewares.use(modelApi(directory)); }, configurePreviewServer(server) { server.middlewares.use(modelApi(directory)); } };
export default defineConfig({ plugins: [vue(), models], resolve: { dedupe: ['vue'] }, server: { host: '127.0.0.1', port: 5174, strictPort: true } });
