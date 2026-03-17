import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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

  const queryClient = useQueryClient();
  const { data: me, isLoading } = trpc.clientPortal.me.useQuery({ slug });
  const { data: barbershop } = trpc.clientPortal.getBarbershop.useQuery({ slug });

  const primaryColor = barbershop?.primaryColor ?? "#000000";
  const secondaryColor = barbershop?.secondaryColor ?? "#FFFFFF";

  // Cancelamento de agendamento
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; appointmentId: number | null }>({
    open: false, appointmentId: null,
  });
  const [cancelReason, setCancelReason] = useState("");

  // Cancelamento de assinatura
  const [showCancelSubDialog, setShowCancelSubDialog] = useState(false);

  const cancelAppointmentMutation = trpc.clientPortal.cancelAppointment.useMutation({
    onSuccess: (data) => {
      toast.success(data.creditsRefunded
        ? "Agendamento cancelado. Seu crédito foi devolvido!"
        : "Agendamento cancelado."
      );
      queryClient.invalidateQueries({ queryKey: [['client', 'me']] });
      setCancelDialog({ open: false, appointmentId: null });
      setCancelReason("");
    },
    onError: (err) => toast.error(err.message),
  });

  const cancelSubscriptionMutation = trpc.clientPortal.cancelSubscription.useMutation({
    onSuccess: () => {
      toast.success("Assinatura cancelada.");
      queryClient.invalidateQueries({ queryKey: [['client', 'me']] });
      navigate(`/b/${slug}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogout = async () => {
    await fetch("/api/client/logout", { method: "POST", credentials: "include" });
    queryClient.invalidateQueries({ queryKey: [['client', 'me']] });
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

  const initials = user.name.split(" ").slice(0, 2).map((n: string) => n[0]?.toUpperCase() ?? "").join("");

  return (
    <div className="min-h-screen" style={{
      backgroundColor: "#FBF8F3",
      "--portal-primary": primaryColor,
      "--portal-secondary": secondaryColor,
    } as React.CSSProperties}>
      {/* Header */}
      <header className="sticky top-0 z-40" style={{ backgroundColor: "#FFFFFF", borderBottom: "1px solid #E8DFD0" }}>
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/b/${slug}`)}
              style={{ color: "#2D2418" }} className="hover:opacity-80">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="font-bold" style={{ color: "#2D2418" }}>Minha Conta</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}
            style={{ color: primaryColor }} className="hover:opacity-80">
            <LogOut className="h-4 w-4 mr-2" />Sair
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Dados do usuário */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{ backgroundColor: primaryColor, color: secondaryColor }}>
                {initials}
              </div>
              <div>
                <p className="text-lg font-bold">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                {user.phone && <p className="text-sm text-muted-foreground">{user.phone}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Assinatura */}
        <section className="space-y-3">
          <h2 className="font-bold text-lg">Minha Assinatura</h2>

          {sub && plan ? (
            <Card className="border-2" style={{ borderColor: primaryColor }}>
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

                {/* Barra de progresso de créditos */}
                {!isUnlimited && plan.creditsPerMonth > 0 && (
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (sub.creditsRemaining / plan.creditsPerMonth) * 100)}%`,
                        backgroundColor: primaryColor,
                      }} />
                  </div>
                )}

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
                  onClick={() => setShowCancelSubDialog(true)}
                  disabled={cancelSubscriptionMutation.isPending}
                >
                  Cancelar Assinatura
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
                <Button onClick={() => navigate(`/b/${slug}`)}
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}>
                  Ver Planos
                </Button>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Agendamentos futuros */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-lg">Próximos Agendamentos</h2>
            <Button size="sm" onClick={() => navigate(`/b/${slug}/agendar`)}
              style={{ backgroundColor: primaryColor, color: secondaryColor }}>
              + Agendar
            </Button>
          </div>

          {upcomingAppointments && upcomingAppointments.length > 0 ? (
            upcomingAppointments.map(appt => (
              <Card key={appt.id}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <CalendarIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{appt.serviceName ?? "—"}</p>
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

      {/* Dialog de cancelamento de assinatura */}
      <Dialog open={showCancelSubDialog} onOpenChange={setShowCancelSubDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Cancelar Assinatura
            </DialogTitle>
            <DialogDescription>
              Tem certeza? Seu plano será cancelado imediatamente e os créditos restantes serão perdidos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCancelSubDialog(false)}>
              Manter plano
            </Button>
            <Button
              variant="destructive"
              disabled={cancelSubscriptionMutation.isPending}
              onClick={() => {
                cancelSubscriptionMutation.mutate({ slug });
                setShowCancelSubDialog(false);
              }}
            >
              {cancelSubscriptionMutation.isPending ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
