FROM mcr.microsoft.com/playwright:v1.55.1-noble
WORKDIR /app
RUN npm install --no-save playwright@1.55.1 pg@8.16.3
COPY run.mjs ./
CMD ["node", "run.mjs"]
