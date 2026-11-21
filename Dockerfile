FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
ENV PORT=7001
EXPOSE 7001
CMD ["node", "src/server.js"]
