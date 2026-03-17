# Google Analytics 4 — Plano de Implementação

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar GA4 para coleta de dados de uso da plataforma e eventos customizados.

**Architecture:** Script gtag.js injetado via Vite env var no index.html, helper `trackEvent` para eventos customizados.

**Tech Stack:** GA4, gtag.js, Vite env vars, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-17-google-analytics-design.md`

---

## Chunk 1: GA4 Script + Helper + Eventos

### Task 1: Adicionar gtag.js ao index.html

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Adicionar script GA4 no head do index.html**

Inserir antes do `</head>`:

```html
<script>
  window.GA_MEASUREMENT_ID = '%VITE_GA_MEASUREMENT_ID%';
</script>
<script>
  (function() {
    var id = window.GA_MEASUREMENT_ID;
    if (!id || id === '' || id.indexOf('%') !== -1) return;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + id;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', id);
  })();
</script>
```

> Nota: Usa `%VITE_GA_MEASUREMENT_ID%` que o Vite substitui automaticamente no HTML. Se a env var não está definida, o script não carrega (graceful degradation).

---

### Task 2: Criar helper analytics.ts

**Files:**
- Create: `client/src/lib/analytics.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

export function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  if (typeof window !== "undefined" && window.gtag) {
    window.gtag("event", eventName, params);
  }
}
```

---

### Task 3: Adicionar eventos nos pontos-chave

**Files:**
- Modify: `client/src/pages/portal/ClientAuthPages.tsx`
- Modify: `client/src/pages/portal/BookingPage.tsx`
- Modify: `client/src/pages/portal/Subscribepage.tsx`

- [ ] **Step 1: Evento sign_up_client em ClientAuthPages.tsx**

No `handleRegister`, após `toast.success("Conta criada com sucesso!")`:
```typescript
import { trackEvent } from "@/lib/analytics";
// ...
trackEvent("sign_up_client", { barbershop_slug: slug ?? "" });
```

- [ ] **Step 2: Evento booking_created em BookingPage.tsx**

No `bookMutation` onSuccess:
```typescript
import { trackEvent } from "@/lib/analytics";
// ...
trackEvent("booking_created", {
  barbershop_slug: slug ?? "",
  service_count: selectedServices.length,
});
```

- [ ] **Step 3: Evento subscription_started em Subscribepage.tsx**

No `checkoutMutation` onSuccess:
```typescript
import { trackEvent } from "@/lib/analytics";
// ...
trackEvent("subscription_started", {
  barbershop_slug: slug ?? "",
  plan_name: plan?.name ?? "",
});
```

- [ ] **Step 4: Verificar build TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
git add client/index.html client/src/lib/analytics.ts client/src/pages/portal/ClientAuthPages.tsx client/src/pages/portal/BookingPage.tsx client/src/pages/portal/Subscribepage.tsx
git commit -m "feat: integrar Google Analytics 4 com eventos customizados"
```
