import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CalendarIcon, Star, LogOut, Loader2, AlertCircle, XCircle, Infinity } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ClientAccountPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const utils = trpc.useUtils();
  const { data: me, isLoading } = trpc.client.me.useQuery({ slug });

  // Cancelamento de agendamento
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; appointmentId: number | null }>({
    open: false, appointmentId: null,
  });
  const [cancelReason, setCancelReason] = useState("");

  const cancelAppointmentMutation = trpc.client.cancelAppointment.useMutation({
    onSuccess: (data) => {
      toast.success(data.creditsRefunded
        ? "Agendamento cancelado. Seu crédito foi devolvido!"
        : "Agendamento cancelado."
      );
      utils.client.me.invalidate();
      setCancelDialog({ open: false, appointmentId: null });
      setCancelReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelSubscriptionMutation = trpc.client.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success("Assinatura cancelada.");
      utils.client.me.invalidate();
      navigate(`/b/${slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogout = async () => {
    await fetch("/api/client/logout", { method: "POST", credentials: "include" });
    utils.client.me.invalidate();
    navigate(`/b/${slug}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!me?.user) {
    navigate(`/b/${slug}/login`);
    return null;
  }

  const { user, subscription, upcomingAppointments } = me;
  const sub = subscription?.subscription;
  const plan = subscription?.plan as any;
  const isUnlimited = plan?.isUnlimited ?? false;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/b/${slug}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-bold">Minha Conta</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
            <LogOut className="h-4 w-4 mr-2" />Sair
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Dados do usuário */}
        <Card>
          <CardContent className="p-4">
            <p className="text-lg font-bold">{user.name}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            {user.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
          </CardContent>
        </Card>

        {/* Assinatura */}
        <section className="space-y-3">
          <h2 className="font-bold text-lg">Minha Assinatura</h2>

          {sub && plan ? (
            <Card className="border-primary border-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  <Badge className="bg-green-500">Ativa</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {isUnlimited ? "Agendamentos" : "Créditos disponíveis"}
                  </span>
                  <div className="flex items-center gap-1 font-bold">
                    {isUnlimited ? (
                      <><Infinity className="h-4 w-4 text-blue-500" /><span>Ilimitado</span></>
                    ) : (
                      <><Star className="h-4 w-4 text-yellow-500" /><span>{sub.creditsRemaining} de {plan.creditsPerMonth}</span></>
                    )}
                  </div>
                </div>

                {sub.currentPeriodEnd && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Próxima renovação</span>
                    <span>{new Date(sub.currentPeriodEnd).toLocaleDateString("pt-BR")}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Valor mensal</span>
                  <span className="font-semibold">R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}</span>
                </div>

                <Button
                  variant="outline" size="sm" className="w-full text-destructive hover:text-destructive"
                  onClick={() => { if (confirm("Tem certeza que quer cancelar a assinatura?")) cancelSubscriptionMutation.mutate({ slug }); }}
                  disabled={cancelSubscriptionMutation.isPending}
                >
                  {cancelSubscriptionMutation.isPending ? "Cancelando..." : "Cancelar Assinatura"}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center space-y-3">
                <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="font-semibold">Nenhum plano ativo</p>
                <p className="text-sm text-muted-foreground">
                  Assine um plano para ter créditos mensais de agendamento.
                </p>
                <Button onClick={() => navigate(`/b/${slug}`)}>Ver Planos</Button>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Agendamentos futuros */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Próximos Agendamentos</h2>
            <Button size="sm" onClick={() => navigate(`/b/${slug}/agendar`)}>+ Agendar</Button>
          </div>

          {upcomingAppointments && upcomingAppointments.length > 0 ? (
            upcomingAppointments.map(appt => (
              <Card key={appt.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{appt.serviceName}</p>
                      <p className="text-sm text-muted-foreground">
                        com {appt.barberName} · {new Date(appt.appointmentDate).toLocaleDateString("pt-BR", {
                          weekday: "short", day: "numeric", month: "short"
                        })} às {new Date(appt.appointmentDate).toLocaleTimeString("pt-BR", {
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={appt.status === "confirmed" ? "default" : "secondary"} className="text-xs">
                      {appt.status === "confirmed" ? "Confirmado" : "Pendente"}
                    </Badge>
                    {(appt.status === "confirmed" || appt.status === "pending") && (
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Cancelar agendamento"
                        onClick={() => setCancelDialog({ open: true, appointmentId: appt.id })}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                Nenhum agendamento futuro.
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      {/* Dialog de cancelamento de agendamento */}
      <Dialog open={cancelDialog.open} onOpenChange={open => {
        if (!open) { setCancelDialog({ open: false, appointmentId: null }); setCancelReason(""); }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Cancelar Agendamento
            </DialogTitle>
            <DialogDescription>
              Se você não puder comparecer, cancele com antecedência. Seu crédito será devolvido automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Textarea
              placeholder="Motivo do cancelamento (opcional)"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelDialog({ open: false, appointmentId: null })}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelAppointmentMutation.isPending}
              onClick={() => {
                if (!cancelDialog.appointmentId) return;
                cancelAppointmentMutation.mutate({
                  slug,
                  appointmentId: cancelDialog.appointmentId,
                  reason: cancelReason || undefined,
                });
              }}
            >
              {cancelAppointmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
