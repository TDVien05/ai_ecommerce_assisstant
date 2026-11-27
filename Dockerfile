FROM node:22-slim AS client-build
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
ARG VITE_REAL_API=auth
ENV VITE_REAL_API=$VITE_REAL_API
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SERVE_CLIENT_DIR=/app/public
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY --from=client-build /client/dist ./public
EXPOSE 4000
CMD ["sh", "-c", "npm run migrate && npm run seed && exec node src/index.js"]
