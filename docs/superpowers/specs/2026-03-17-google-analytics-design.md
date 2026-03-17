# Spec — Google Analytics 4 Integration

**Data:** 2026-03-17
**Status:** Aprovado (autorização autônoma do owner)

---

## Contexto

O owner precisa coletar dados de uso da plataforma para tomar decisões de negócio. Google Analytics 4 (GA4) é o padrão da indústria e gratuito.

---

## Requisitos

1. **GA4 no admin dashboard** — rastrear uso por owners/barbers
2. **GA4 no portal público** — rastrear uso por clientes em cada barbearia
3. **Eventos customizados** para ações importantes:
   - Registro de owner
   - Registro de cliente
   - Agendamento criado
   - Assinatura SaaS iniciada/paga
   - Assinatura de cliente criada
4. **Measurement ID configurável** via variável de ambiente

---

## Solução Técnica

### 1. Modificar: `client/index.html`

Adicionar gtag.js script no `<head>`:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

O `GA_MEASUREMENT_ID` será injetado pelo Vite como `import.meta.env.VITE_GA_MEASUREMENT_ID`.

### 2. Novo arquivo: `client/src/lib/analytics.ts`

Helper para disparar eventos customizados:

```typescript
export function trackEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', eventName, params);
  }
}
```

### 3. Adicionar chamadas `trackEvent` nos pontos-chave

| Evento | Local | Parâmetros |
|---|---|---|
| `sign_up_owner` | ClientAuthPages.tsx / auth register | method: email |
| `sign_up_client` | ClientAuthPages.tsx register | barbershop_slug |
| `booking_created` | BookingPage.tsx onSuccess | barbershop_slug, service_count |
| `subscription_started` | SubscribePage.tsx onSuccess | plan_name |
| `saas_checkout` | Subscription page checkout | plan_name |

### 4. Page views automáticos

GA4 rastreia page views automaticamente via History API. Não é necessário configuração adicional para SPAs com wouter/react-router.

---

## Arquivos Modificados/Criados

| Arquivo | Mudança |
|---|---|
| `client/index.html` | Script gtag.js |
| `client/src/lib/analytics.ts` | **NOVO** — helper trackEvent |
| `client/src/pages/portal/BookingPage.tsx` | trackEvent booking_created |
| `client/src/pages/portal/ClientAuthPages.tsx` | trackEvent sign_up_client |
| `client/src/pages/portal/Subscribepage.tsx` | trackEvent subscription_started |

---

## Variáveis de Ambiente

| Variável | Descrição |
|---|---|
| `VITE_GA_MEASUREMENT_ID` | GA4 Measurement ID (ex: G-XXXXXXXXXX) |

---

## Verificação

1. Abrir app → GA4 Realtime mostra visitante
2. Registrar cliente → evento `sign_up_client` no GA4
3. Fazer agendamento → evento `booking_created` no GA4
4. Sem GA_MEASUREMENT_ID → nenhum script carregado (graceful degradation)
