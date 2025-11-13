# 💈 SaaS Barbearia

Sistema completo de gestão para barbearias com agendamento, pagamentos, relatórios e automação.

## 🚀 Funcionalidades

### Gestão de Cadastros
- ✅ **Clientes**: Cadastro completo com histórico de visitas e controle de recorrência
- ✅ **Barbeiros**: Gerenciamento de equipe com especialidades
- ✅ **Serviços**: Catálogo de serviços com preços e duração

### Sistema de Agendamento
- ✅ Calendário visual organizado por data
- ✅ Seleção de barbeiro, serviço e horário
- ✅ Status do agendamento (pendente, confirmado, concluído, cancelado)
- ✅ Validação de conflitos de horário

### Pagamentos
- ✅ Integração completa com Stripe
- ✅ Histórico de transações
- ✅ Suporte a múltiplos métodos de pagamento
- ✅ Webhooks para sincronização automática

### Relatórios e Analytics
- ✅ Dashboard com métricas principais
- ✅ Receita total e ticket médio
- ✅ Taxa de conclusão e cancelamento
- ✅ Serviços mais solicitados
- ✅ Análise de performance por período

### Marketing e Automação
- ✅ Campanhas promocionais (desconto, reativação, indicação)
- ✅ Identificação de clientes inativos por período configurável
- ✅ Automação WhatsApp para reativação
- ✅ Templates de mensagens personalizáveis
- ✅ Histórico de mensagens enviadas

### Interface
- ✅ Design elegante e minimalista
- ✅ Totalmente responsivo
- ✅ Tema profissional para barbearias
- ✅ Navegação lateral intuitiva

## 🛠️ Tecnologias

- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Backend**: Node.js, Express, tRPC 11
- **Banco de Dados**: MySQL/TiDB (Supabase)
- **ORM**: Drizzle ORM
- **Pagamentos**: Stripe
- **Autenticação**: Manus OAuth
- **UI Components**: shadcn/ui, Radix UI

## 📦 Instalação

```bash
# Instalar dependências
pnpm install

# Configurar variáveis de ambiente
# Configure as variáveis necessárias no painel de administração

# Aplicar schema do banco de dados
pnpm db:push

# Iniciar servidor de desenvolvimento
pnpm dev
```

## 🔧 Configuração

### 1. Banco de Dados (Supabase)
1. Crie um projeto no [Supabase](https://supabase.com)
2. Copie a connection string do MySQL
3. Adicione em `DATABASE_URL` nas variáveis de ambiente

### 2. Stripe
1. Crie uma conta no [Stripe](https://stripe.com)
2. Obtenha suas chaves de API (test/live)
3. Configure o webhook endpoint: `/api/stripe/webhook`
4. Adicione `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET`

### 3. WhatsApp (Opcional)
Para ativar a automação WhatsApp, integre uma API como:
- Twilio
- Evolution API
- Baileys

## 📱 Estrutura do Projeto

```
saas-barbearia/
├── client/                 # Frontend React
│   ├── src/
│   │   ├── pages/         # Páginas da aplicação
│   │   ├── components/    # Componentes reutilizáveis
│   │   └── lib/           # Utilitários e configurações
├── server/                # Backend Node.js
│   ├── routers.ts         # Rotas tRPC
│   ├── db.ts              # Helpers do banco de dados
│   └── _core/             # Configurações do framework
├── drizzle/               # Schema e migrações
│   └── schema.ts          # Definição das tabelas
└── shared/                # Código compartilhado
```

## 🚀 Deploy

### Vercel (Recomendado)
1. Conecte seu repositório GitHub à Vercel
2. Configure as variáveis de ambiente
3. Deploy automático a cada push

### Outras Plataformas
O projeto é compatível com qualquer plataforma que suporte Node.js:
- Railway
- Render
- Heroku
- AWS
- Google Cloud

## 📄 Licença

MIT

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para abrir issues e pull requests.

---

Desenvolvido com ❤️ para barbearias modernas
