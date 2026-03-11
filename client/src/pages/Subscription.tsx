import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Zap, Crown, Rocket, AlertTriangle, Clock, CreditCard, ExternalLink, Settings } from "lucide-react";
import { toast } from "sonner";

interface Plan {
  id: number;
  name: string;
  description: string;
  price_in_cents: number;
  max_barbers: number;
}

interface Subscription {
  status: string;
  plan_name: string;
  price_in_cents: number;
  max_barbers: number;
  trial_ends_at: string | null;
  current_period_end: string | null;
}

const planIcons: Record<string, any> = {
  Starter: Rocket,
  Profissional: Zap,
  Premium: Crown,
};

const planFeatures: string[] = [
  "Agendamentos ilimitados",
  "Gestão completa de clientes",
  "Relatórios e analytics",
  "Automação WhatsApp",
  "Campanhas de marketing",
  "Cupons de desconto",
  "Sistema de indicação/referral",
  "Suporte por email",
];

const statusColor: Record<string, string> = {
  trialing: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  past_due: "bg-yellow-100 text-yellow-800",
  cancelled: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-800",
};

const statusLabel: Record<string, string> = {
  trialing: "Trial ativo",
  active: "Ativa",
  past_due: "Pagamento pendente",
  cancelled: "Cancelada",
  expired: "Expirada",
};

export default function Subscription() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [canUse, setCanUse] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("success")) {
      toast.success("Assinatura ativada com sucesso! Bem-vindo ao plano pago. 🎉");
    }
    if (params.get("cancelled")) {
      toast.info("Checkout cancelado. Você pode assinar quando quiser.");
    }
    if (params.get("mp_connect") === "success") {
      toast.success("Conta Mercado Pago conectada! Agendamentos pagos serão transferidos para você. 🎉");
    }
    if (params.get("mp_connect") === "error") {
      toast.error("Erro ao conectar conta Mercado Pago. Tente novamente em Configurações.");
    }
  }, [search]);

  useEffect(() => {
    async function load() {
      try {
        const [plansRes, subRes] = await Promise.all([
          fetch("/api/saas/plans"),
          fetch("/api/saas/subscription"),
        ]);
        const plansData = await plansRes.json();
        const subData = await subRes.json();
        setPlans(plansData.plans ?? []);
        setSubscription(subData.subscription);
        setCanUse(subData.canUse ?? false);
        setDaysLeft(subData.daysLeftTrial ?? null);
      } catch {
        toast.error("Erro ao carregar planos");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCheckout(planId: number) {
    setCheckingOut(planId);
    try {
      const res = await fetch("/api/saas/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error ?? "Erro ao iniciar checkout");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setCheckingOut(null);
    }
  }

  async function handleCancel() {
    if (!confirm("Tem certeza que deseja cancelar sua assinatura? Você perderá o acesso ao fim do período atual.")) return;
    setCancelling(true);
    try {
      const res = await fetch("/api/saas/cancel", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Assinatura cancelada. Você terá acesso até o fim do período atual.");
        setSubscription((s) => s ? { ...s, status: "cancelled" } : s);
      } else {
        toast.error(data.error ?? "Erro ao cancelar assinatura");
      }
    } catch {
      toast.error("Erro de conexão");
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-8 p-6">

        {/* Cabeçalho */}
        <div>
          <h1 className="text-2xl font-bold">Planos e Assinatura</h1>
          <p className="text-muted-foreground mt-1">
            Escolha o plano ideal para sua barbearia
          </p>
        </div>

        {/* Banner de trial ativo — fora do map */}
        {subscription?.status === "trialing" && daysLeft !== null && daysLeft > 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center gap-3 text-sm text-blue-800">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              Você está no período de teste gratuito.{" "}
              <strong>{daysLeft} dia{daysLeft !== 1 ? "s" : ""} restante{daysLeft !== 1 ? "s" : ""}</strong>.
              Assine um plano abaixo para continuar após o trial sem interrupções.
            </span>
          </div>
        )}

        {/* Banner trial expirado — fora do map */}
        {(subscription?.status === "expired" ||
          (subscription?.status === "trialing" && daysLeft === 0)) && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-3 text-sm text-red-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Seu período de teste encerrou.{" "}
              <strong>Assine um plano para continuar usando o sistema.</strong>
            </span>
          </div>
        )}

        {/* Status da assinatura atual */}
        {subscription && (
          <Card className="border-l-4 border-l-primary">
            <CardContent className="pt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-lg">{subscription.plan_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[subscription.status] ?? "bg-gray-100 text-gray-800"}`}>
                    {statusLabel[subscription.status] ?? subscription.status}
                  </span>
                </div>

                {subscription.status === "trialing" && daysLeft !== null && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>
                      {daysLeft > 0
                        ? `${daysLeft} dia${daysLeft !== 1 ? "s" : ""} restante${daysLeft !== 1 ? "s" : ""} no trial`
                        : "Trial encerrado hoje — assine para continuar"}
                    </span>
                  </div>
                )}

                {subscription.status === "active" && subscription.current_period_end && (
                  <p className="text-sm text-muted-foreground">
                    Próxima cobrança:{" "}
                    {new Date(subscription.current_period_end).toLocaleDateString("pt-BR")}
                  </p>
                )}

                {subscription.status === "past_due" && (
                  <div className="flex items-center gap-1.5 text-sm text-yellow-700">
                    <AlertTriangle className="h-4 w-4" />
                    <span>Pagamento com problema — entre em contato com o suporte</span>
                  </div>
                )}

                {(subscription.status === "cancelled" || subscription.status === "expired") && (
                  <p className="text-sm text-red-600">
                    Assinatura inativa — escolha um plano abaixo para reativar
                  </p>
                )}
              </div>

              {(subscription.status === "active" || subscription.status === "past_due") && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="flex items-center gap-2 shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <CreditCard className="h-4 w-4" />
                  {cancelling ? "Cancelando..." : "Cancelar assinatura"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Cards de planos */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const Icon = planIcons[plan.name] ?? Zap;
            const isCurrentPlan = subscription?.plan_name === plan.name && canUse;
            const isPro = plan.name === "Profissional";

            return (
              <Card
                key={plan.id}
                className={`relative flex flex-col transition-shadow ${isPro ? "border-primary shadow-lg" : "hover:shadow-md"}`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
                    <span className="bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full shadow">
                      Mais popular
                    </span>
                  </div>
                )}

                <CardHeader className="pb-2 pt-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </div>
                  <CardDescription className="text-xs min-h-[32px]">
                    {plan.description}
                  </CardDescription>
                  <div className="pt-3">
                    <span className="text-3xl font-bold">
                      R$ {(plan.price_in_cents / 100).toFixed(0)}
                    </span>
                    <span className="text-muted-foreground text-sm">/mês</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.max_barbers === -1
                      ? "Barbeiros ilimitados"
                      : `Até ${plan.max_barbers} barbeiro${plan.max_barbers !== 1 ? "s" : ""}`}
                  </p>
                </CardHeader>

                <CardContent className="flex flex-col flex-1 justify-between gap-5">
                  <ul className="space-y-2">
                    {planFeatures.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan && subscription?.status === "active" ? (
                    <Button variant="outline" disabled className="w-full">
                      ✓ Plano atual
                    </Button>
                  ) : isCurrentPlan && subscription?.status === "trialing" ? (
                    <Button
                      className="w-full"
                      variant={isPro ? "default" : "outline"}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkingOut !== null}
                    >
                      {checkingOut === plan.id
                        ? "Aguarde..."
                        : daysLeft && daysLeft > 0
                          ? `Assinar agora (${daysLeft}d restantes no trial)`
                          : "Assinar agora"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={isPro ? "default" : "outline"}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={checkingOut !== null}
                    >
                      {checkingOut === plan.id ? "Aguarde..." : `Assinar ${plan.name}`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-center text-sm text-muted-foreground">
          7 dias grátis em qualquer plano · Cancele a qualquer momento · Pagamento via Mercado Pago
        </p>

        {/* ── Mercado Pago Connect ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Recebimentos — Mercado Pago
            </CardTitle>
            <CardDescription>
              Conecte sua conta Mercado Pago para receber os pagamentos de agendamentos online
              diretamente via PIX e cartão, sem intermediários.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Configure e gerencie a conexão com o Mercado Pago em{" "}
                <strong>Configurações → Pagamentos</strong>.
                Após conectar, os pagamentos de agendamentos serão transferidos diretamente para sua conta.
              </p>
              <Button
                variant="outline"
                className="shrink-0 flex items-center gap-2"
                onClick={() => window.location.href = "/configuracoes"}
              >
                <Settings className="h-4 w-4" />
                Ir para Configurações
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="pb-4" />

      </div>
    </DashboardLayout>
  );
}
