FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY sql ./sql
COPY src ./src
RUN npm run build
CMD ["node", "dist/index.js"]
