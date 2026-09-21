FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY openapi.json README.md ./
RUN mkdir -p /app/data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/server.js"]
