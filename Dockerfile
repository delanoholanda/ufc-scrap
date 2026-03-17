
# Stage 1: Dependências e Build
FROM node:20-bookworm AS builder
WORKDIR /app

# Instalar dependências necessárias para o build
COPY package.json package-lock.json* ./
RUN npm install

# Copiar código e rodar build
COPY . .

# Usar uma variável de ambiente temporária para o build passar
ENV SESSION_SECRET=build_time_only_secret
RUN npm run build

# Stage 2: Runner
FROM node:20-bookworm AS runner
WORKDIR /app

# Instalar dependências de sistema para o Puppeteer e Google Chrome
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    fonts-liberation \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Instalar Google Chrome Estável
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

# Copiar arquivos necessários do builder
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Garantir permissões para a pasta de dados e uploads
RUN mkdir -p data public/uploads && chmod -R 777 data public/uploads

EXPOSE 3000

# O comando de inicialização do Next.js standalone
CMD ["node", "server.js"]
