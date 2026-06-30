FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/shiftflow.db NODE_ENV=production
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "src/server.js"]
