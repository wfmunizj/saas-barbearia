# TODO - SaaS Barbearia

## Infraestrutura e Configuração
- [x] Configurar schema do banco de dados (clientes, barbeiros, serviços, agendamentos, pagamentos, campanhas)
- [x] Integrar Stripe para pagamentos
- [ ] Configurar variáveis de ambiente para Supabase
- [ ] Preparar projeto para deploy na Vercel

## Autenticação e Controle de Acesso
- [x] Sistema de autenticação com roles (admin/barbeiro/cliente)
- [x] Dashboard principal com navegação lateral
- [x] Página de login e logout

## Cadastros Básicos
- [x] CRUD de clientes (nome, telefone, email, histórico)
- [x] CRUD de barbeiros (nome, especialidades, horários disponíveis)
- [x] CRUD de serviços (nome, descrição, duração, preço)
- [x] Listagem com busca e filtros para cada cadastro

## Sistema de Agendamento
- [x] Calendário visual para agendamentos
- [x] Seleção de barbeiro, serviço e horário
- [x] Validação de conflitos de horário
- [x] Status do agendamento (pendente, confirmado, concluído, cancelado)
- [x] Notificações de agendamento

## Sistema de Pagamentos
- [x] Integração com Stripe Checkout
- [x] Registro de pagamentos no banco de dados
- [x] Histórico de transações
- [x] Suporte a diferentes métodos de pagamento

## Relatórios e Analytics
- [x] Dashboard com métricas principais (receita, agendamentos, clientes ativos)
- [x] Relatório de faturamento por período
- [x] Relatório de performance de barbeiros
- [x] Relatório de serviços mais solicitados
- [x] Gráficos e visualizações

## Sistema de Recorrência
- [x] Identificação de clientes inativos por período configurável
- [x] Registro de última visita dos clientes
- [x] Dashboard de clientes recorrentes vs inativos

## Automação WhatsApp
- [x] Configuração de mensagens automáticas
- [x] Sistema de envio para clientes inativos
- [x] Histórico de mensagens enviadas
- [x] Templates de mensagens personalizáveis

## Marketing
- [x] Criação de campanhas promocionais
- [x] Cupons de desconto
- [x] Sistema de indicação/referral
- [x] Envio de mensagens em massa

## Interface e UX
- [x] Design elegante e minimalista
- [x] Responsividade mobile
- [x] Tema de cores profissional
- [x] Componentes reutilizáveis
- [x] Loading states e feedback visual
- [x] Tratamento de erros amigável
