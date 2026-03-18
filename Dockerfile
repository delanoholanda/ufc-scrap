# Estágio de Dependências e Build
FROM node:20-bookworm AS builder
WORKDIR /app

# Copia arquivos de definição de pacotes
COPY package.json package-lock.json* ./

# Instala todas as dependências (incluindo devDependencies para o build)
RUN npm install

# Copia o restante do código
COPY . .

# Variável temporária para o build passar sem erro de validação de ambiente
ENV SESSION_SECRET=build_temporary_secret
ENV NEXT_TELEMETRY_DISABLED=1

# Executa o build de produção (gera a pasta .next/standalone)
RUN npm run build

# Estágio Final (Runner)
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Instala as dependências de sistema necessárias para o Chrome/Puppeteer no Debian Slim
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
    && apt-get update && apt-get install -y google-chrome-stable --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copia os arquivos necessários do estágio builder
# O Next.js standalone gera tudo o que é necessário para rodar o servidor em uma pasta isolada
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Cria a pasta de dados para o SQLite e logs (persistência via volume no docker-compose)
RUN mkdir -p data

# Porta padrão do Next.js
EXPOSE 3000

# Comando para iniciar a aplicação usando o servidor standalone gerado
CMD ["node", "server.js"]