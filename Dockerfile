
# Estágio 1: Instalar dependências e buildar o projeto
FROM node:20-bookworm AS builder
WORKDIR /app

# Copiar arquivos de dependências
COPY package.json package-lock.json* ./
RUN npm install

# Copiar código fonte
COPY . .

# Desativar telemetria do Next.js
ENV NEXT_TELEMETRY_DISABLED 1

# Variável temporária para o build
ENV SESSION_SECRET="build-fallback-secret"

# Buildar o projeto
RUN npm run build

# Estágio 2: Runner (Imagem final)
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Instalar dependências do sistema para o Chrome/Puppeteer no Debian Bookworm
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
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Criar pasta de dados e uploads com permissões corretas
RUN mkdir -p data public/uploads && chown -R node:node data public/uploads

# Copiar arquivos necessários do estágio de build
# O standalone build gera tudo o que é necessário para rodar o app sem node_modules completo
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Definir permissões para o usuário node
USER node

# Porta exposta (será mapeada no docker-compose)
EXPOSE 3000

# Comando para iniciar a aplicação
# O standalone server fica em server.js
CMD ["node", "server.js"]
