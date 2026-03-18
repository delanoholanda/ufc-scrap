
# Stage 1: Builder
FROM node:20-bookworm AS builder
WORKDIR /app

# Instala dependências
COPY package.json package-lock.json* ./
RUN npm install

# Copia código e builda
COPY . .
# Variável temporária para o build passar sem erros de segredo
ENV SESSION_SECRET=build_time_secret_placeholder
RUN npm run build

# Stage 2: Runner
FROM node:20-bookworm AS runner
WORKDIR /app

ENV NODE_ENV=production

# Instala dependências do sistema para o Chrome e Puppeteer no Debian Bookworm
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
    && rm -rf /var/lib/apt/lists/*

# Instala o Google Chrome estável oficial
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Copia apenas o necessário do estágio de builder (standalone mode)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Garante permissões na pasta de dados
RUN mkdir -p data && chmod 777 data

EXPOSE 3000

# O standalone mode gera um server.js na raiz
CMD ["node", "server.js"]
