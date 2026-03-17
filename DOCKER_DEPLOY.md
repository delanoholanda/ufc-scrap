# Manual de Implantação com Docker

Este manual descreve como implantar o **UFC Data Scraper** em um servidor Linux utilizando Docker e Docker Compose na porta **8098**.

## Pré-requisitos

1.  **Docker** instalado.
2.  **Docker Compose** instalado.
3.  Acesso ao terminal do servidor.

## Passo a Passo

### 1. Clonar ou Copiar os Arquivos
Certifique-se de que todos os arquivos do projeto (incluindo o `Dockerfile` e `docker-compose.yml`) estejam na pasta de destino no servidor.

### 2. Configurar o Ambiente
Crie ou edite o arquivo `.env` na raiz do projeto com as credenciais reais:

```env
# Banco de Dados PostgreSQL (Obrigatório para persistência real)
POSTGRES_HOST=seu_host
POSTGRES_PORT=5432
POSTGRES_USER=seu_usuario
POSTGRES_PASSWORD=sua_senha
POSTGRES_DB=seu_banco

# LDAP
LDAP_SERVER=seu_servidor_ldap
LDAP_PORT=389
LDAP_USERNAME="cn=admin,dc=..."
LDAP_PASSWORD="sua_senha_ldap"

# E-mail (SMTP)
EMAIL_HOST=seu_smtp
EMAIL_PORT=587
EMAIL_USER=seu_email
EMAIL_PASS=sua_senha_email

# Segurança
SESSION_SECRET="uma_chave_longa_e_aleatoria"
```

### 3. Construir e Iniciar o Container
Execute o seguinte comando no terminal:

```bash
docker-compose up -d --build
```

### 4. Verificar o Status
Para confirmar se o container está rodando e ver os logs iniciais:

```bash
docker ps
docker-compose logs -f
```

### 5. Acessar a Aplicação
A aplicação estará disponível em:
`http://ip-do-servidor:8098`

## Observações Importantes

- **Persistência do SQLite**: O volume `./data` está mapeado para garantir que, se você usar o SQLite temporariamente, os dados não sejam perdidos ao reiniciar o container.
- **Persistência de Imagens**: O volume `./public/uploads` garante que as fotos enviadas pelo sistema fiquem salvas no disco do servidor.
- **Porta**: O mapeamento `"8098:3000"` no `docker-compose.yml` redireciona o tráfego da porta 8098 do servidor para a porta 3000 interna do container.
- **Robô (Scraper)**: O Dockerfile instala automaticamente o Google Chrome e as bibliotecas de interface gráfica necessárias para o Puppeteer rodar em modo headless.