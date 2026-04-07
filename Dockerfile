FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
RUN npm ci

COPY . .
RUN npm run build

# --- Production ---
FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci -w server --omit=dev

COPY --from=build /app/client/dist client/dist
COPY --from=build /app/server/dist server/dist

EXPOSE 4201
CMD ["npm", "start"]
