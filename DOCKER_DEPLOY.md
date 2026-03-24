
# Manual de Implantação com Docker

Este manual descreve como implantar o **UFC Data Scraper** em um servidor Linux utilizando Docker e Docker Compose na porta **8098**.

## Passo a Passo para Implantação

### 1. Preparar o Ambiente
Certifique-se de ter o arquivo `.env` na raiz do projeto preenchido corretamente. O segredo `SESSION_SECRET` deve ser uma string longa e aleatória.

### 2. Comando de Build Limpo
Caso você receba erros de "not found" ou cache corrompido, utilize o comando abaixo para forçar o Docker a ignorar o cache e reconstruir tudo do zero:

```bash
docker compose build --no-cache
```

### 3. Iniciar o Container
Após o build concluir com sucesso, suba os serviços em modo background:

```bash
docker compose up -d
```

### 4. Verificar os Logs
Para confirmar se a aplicação subiu corretamente e o banco de dados foi conectado:

```bash
docker compose logs -f
```

### 5. Acesso
A aplicação estará disponível em: `http://ip-do-seu-servidor:8098`

## Dicas de Troubleshooting

- **Erro standalone not found**: Isso geralmente indica que o `npm run build` falhou dentro do Docker. Verifique os logs do build para mensagens de erro do Next.js.
- **Permissões de Pastas**: O Dockerfile já configura as pastas `data/` e `public/uploads/` para o usuário `nextjs`. Se houver erro de escrita, verifique as permissões no seu host Linux.
- **Puppeteer/Chrome**: O robô utiliza o Chrome instalado no container. Se a extração falhar, verifique a conexão com a internet do servidor e se o binário `/usr/bin/google-chrome` está acessível.
