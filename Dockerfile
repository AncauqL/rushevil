FROM node:22-alpine

WORKDIR /app
COPY . .

ENV HOST=0.0.0.0
ENV PORT=8000
EXPOSE 8000

CMD ["node", "server.mjs"]
