import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Star, DollarSign, Loader2, CheckCircle2, CreditCard } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function SubscribePage() {
  const { slug, planId } = useParams<{ slug: string; planId: string }>();
  const [, navigate] = useLocation();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const { data: me } = trpc.client.me.useQuery({ slug });
  const { data: plans, isLoading } = trpc.client.getPlans.useQuery({ slug });

  const plan = plans?.find(p => p.id === parseInt(planId));

  const checkoutMutation = trpc.client.createSubscriptionCheckout.useMutation({
    onSuccess: (data) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast.error("Erro ao criar sessão de pagamento.");
        setIsRedirecting(false);
      }
    },
    onError: (err) => {
      toast.error(err.message);
      setIsRedirecting(false);
    },
  });

  // Redireciona para login se não autenticado
  if (!me?.user) {
    navigate(`/b/${slug}/login?redirect=assinar/${planId}`);
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center p-6 space-y-4">
          <p className="text-lg font-semibold">Plano não encontrado</p>
          <Button onClick={() => navigate(`/b/${slug}`)}>Voltar</Button>
        </Card>
      </div>
    );
  }

  const hasActiveSub = !!me?.subscription;

  function handleSubscribe() {
    setIsRedirecting(true);
    checkoutMutation.mutate({ slug, planId: plan!.id });
  }

  const benefits = [
    `${plan.creditsPerMonth} agendamento${plan.creditsPerMonth > 1 ? "s" : ""} por mês incluído${plan.creditsPerMonth > 1 ? "s" : ""}`,
    "Renovação automática mensal",
    "Cancele quando quiser",
    "Créditos expiram no final do mês",
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/b/${slug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-bold">Assinar Plano</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-10 space-y-6">
        {/* Card do plano */}
        <Card className="border-2 border-primary">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <CardTitle>{plan.name}</CardTitle>
            </div>
            {plan.description && (
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <DollarSign className="h-5 w-5 text-green-500" />
              <span className="text-4xl font-bold">
                R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}
              </span>
              <span className="text-muted-foreground">/mês</span>
            </div>

            <div className="space-y-2 pt-2">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Assinatura ativa */}
        {hasActiveSub && (
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
            <CardContent className="p-4 text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ Você já tem uma assinatura ativa ({me.subscription!.plan.name}). Ao assinar este plano, o atual será cancelado e substituído.
            </CardContent>
          </Card>
        )}

        {/* Dados do usuário */}
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Assinando como</p>
            <p className="font-semibold">{me.user.name}</p>
            <p className="text-sm text-muted-foreground">{me.user.email}</p>
          </CardContent>
        </Card>

        {/* Botão de pagamento */}
        <div className="space-y-3">
          <Button
            className="w-full h-12 text-base"
            onClick={handleSubscribe}
            disabled={isRedirecting || checkoutMutation.isPending}
          >
            {isRedirecting || checkoutMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Redirecionando...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-5 w-5" />
                Assinar por R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}/mês
              </>
            )}
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Pagamento seguro via Stripe. Cancele a qualquer momento.
          </p>
        </div>

        <Button variant="ghost" className="w-full" onClick={() => navigate(`/b/${slug}`)}>
          Voltar
        </Button>
      </main>
    </div>
  );
}