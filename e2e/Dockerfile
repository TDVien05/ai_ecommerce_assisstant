FROM mcr.microsoft.com/playwright:v1.55.1-noble
WORKDIR /app
RUN npm install --no-save playwright@1.55.1 pg@8.16.3 exceljs@4.4.0
COPY run.mjs ./
CMD ["node", "run.mjs"]
