FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY index.js ./
VOLUME ["/app/auth_info"]
CMD ["node", "index.js"]
