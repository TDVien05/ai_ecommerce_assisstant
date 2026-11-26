# Debian slim (glibc) so bcrypt's prebuilt binary works.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# docker-compose.yml overrides this with migrate + nodemon for development.
CMD ["node", "src/index.js"]
