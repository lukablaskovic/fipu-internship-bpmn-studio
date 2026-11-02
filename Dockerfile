FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
COPY packages ./packages
RUN npm ci
COPY index.html vite.config.js model-api.mjs model-store.mjs server.mjs ./
COPY public ./public
COPY src ./src
RUN npm run build -- --base=/studio/ && npm prune --omit=dev
ENV BPMN_MODELS_DIR=/models
USER node
CMD ["node","server.mjs"]
