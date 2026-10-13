FROM node:22-alpine
WORKDIR /app
COPY . .
ENV HOST=0.0.0.0
EXPOSE 5173
USER node
CMD ["node", "server.mjs", "5173"]
