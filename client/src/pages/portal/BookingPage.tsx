import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Clock, User, Scissors, CalendarIcon, Loader2, Users } from "lucide-react";
import { toast } from "sonner";

type Step = "barber" | "service" | "date" | "time" | "confirm";

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("barber");
  const [selectedBarber, setSelectedBarber] = useState<any>(null);
  const [selectedService, setSelectedService] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  // ── Exceção pai/filho ──────────────────────────────────────────────────────
  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [isGuestBooking, setIsGuestBooking] = useState(false);
  const [guestName, setGuestName] = useState("");

  const { data: barbershop } = trpc.client.getBarbershop.useQuery({ slug });
  const { data: me } = trpc.client.me.useQuery({ slug });
  const { data: barbers_ } = trpc.client.getBarbers.useQuery({ slug });
  const { data: services_ } = trpc.client.getServices.useQuery({ slug });
  const { data: slots, isLoading: slotsLoading } = trpc.client.getAvailableSlots.useQuery(
    { slug, barberId: selectedBarber?.id ?? 0, date: selectedDate },
    { enabled: !!selectedBarber && !!selectedDate }
  );

  const primaryColor = barbershop?.primaryColor ?? "#000000";
  const secondaryColor = barbershop?.secondaryColor ?? "#FFFFFF";

  const bookMutation = trpc.client.bookAppointment.useMutation({
    onSuccess: () => {
      if (isGuestBooking) {
        toast.success(`Agendamento confirmado para ${guestName}! Seus créditos não foram debitados.`);
      } else {
        toast.success("Agendamento confirmado!");
      }
      navigate(`/b/${slug}/minha-conta`);
    },
    onError: (err) => {
      toast.error(err.message);
      setIsBooking(false);
    },
  });

  // Redireciona para login se não autenticado
  if (!me?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4"
        style={{ "--portal-primary": primaryColor, "--portal-secondary": secondaryColor } as React.CSSProperties}>
        <Card className="w-full max-w-sm text-center p-6 space-y-4">
          <div className="rounded-2xl p-4 mx-auto w-fit shadow-lg" style={{ backgroundColor: primaryColor }}>
            <Scissors className="h-8 w-8" style={{ color: secondaryColor }} />
          </div>
          <h2 className="text-xl font-bold">Faça login para agendar</h2>
          <p className="text-muted-foreground text-sm">Você precisa ter uma conta para agendar.</p>
          <Button className="w-full" style={{ backgroundColor: primaryColor, color: secondaryColor }}
            onClick={() => navigate(`/b/${slug}/login?redirect=agendar`)}>
            Entrar
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate(`/b/${slug}/cadastro?redirect=agendar`)}>
            Criar conta
          </Button>
        </Card>
      </div>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: "barber", label: "Barbeiro" },
    { key: "service", label: "Serviço" },
    { key: "date", label: "Data" },
    { key: "time", label: "Horário" },
    { key: "confirm", label: "Confirmar" },
  ];

  const currentStepIndex = steps.findIndex(s => s.key === step);

  // Dias permitidos pelo plano do cliente (null = todos os dias)
  const allowedDaysOfWeek: number[] | null = (() => {
    const raw = (me?.subscription?.plan as any)?.allowedDaysOfWeek;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  })();

  const isUnlimitedPlan = (me?.subscription?.plan as any)?.isUnlimited ?? false;

  // Label dinâmico dos dias permitidos
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const planDayLabel = allowedDaysOfWeek
    ? allowedDaysOfWeek.map(d => dayNames[d]).join(", ")
    : null;

  // Gera próximos 30 dias filtrando por dias permitidos e sem domingo
  const availableDates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    const dow = d.getDay();
    if (dow === 0) return null; // remove domingo
    if (allowedDaysOfWeek && !allowedDaysOfWeek.includes(dow)) return null; // plano restringe dias
    return d.toISOString().split("T")[0];
  }).filter(Boolean) as string[];

  // Inicia o booking — se tiver assinatura ativa, mostra popup de guest
  const handleConfirmClick = () => {
    if (me?.subscription && !showGuestDialog) {
      setShowGuestDialog(true);
      return;
    }
    executeBooking();
  };

  const executeBooking = () => {
    if (!selectedBarber || !selectedService || !selectedDate || !selectedTime) return;
    setIsBooking(true);
    const appointmentDate = new Date(`${selectedDate}T${selectedTime}:00`);
    const hasSubscription = !!me?.subscription;
    bookMutation.mutate({
      slug,
      barberId: selectedBarber.id,
      serviceId: selectedService.id,
      appointmentDate,
      notes: notes || undefined,
      useSubscriptionCredit: hasSubscription && !isGuestBooking,
      isGuestBooking,
      guestName: isGuestBooking ? guestName : undefined,
    });
  };

  const handleGuestDialogConfirm = (forGuest: boolean) => {
    setIsGuestBooking(forGuest);
    if (forGuest && !guestName.trim()) {
      // aguarda nome ser preenchido
      return;
    }
    setShowGuestDialog(false);
    executeBooking();
  };

  const creditsRemaining = me?.subscription?.subscription?.creditsRemaining ?? 0;

  return (
    <div className="min-h-screen bg-background" style={{
      "--portal-primary": primaryColor,
      "--portal-secondary": secondaryColor,
    } as React.CSSProperties}>
      {/* Header */}
      <header className="sticky top-0 z-40 shadow-sm" style={{ backgroundColor: primaryColor }}>
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/b/${slug}`)}
            style={{ color: secondaryColor }} className="hover:opacity-80">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-bold" style={{ color: secondaryColor }}>Agendar</h1>
        </div>
      </header>

      {/* Progress */}
      <div className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div
                  className={`h-2 flex-1 rounded-full transition-colors ${i > currentStepIndex ? "bg-muted" : ""}`}
                  style={{ backgroundColor: i <= currentStepIndex ? primaryColor : undefined }}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Passo {currentStepIndex + 1} de {steps.length}: <span className="font-medium">{steps[currentStepIndex].label}</span>
          </p>
          {planDayLabel && (
            <p className="text-xs text-amber-600 mt-1">
              Seu plano permite agendamentos apenas: {planDayLabel}.
            </p>
          )}
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Passo 1: Barbeiro */}
        {step === "barber" && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Escolha o barbeiro</h2>
            {barbers_?.map(barber => (
              <Card
                key={barber.id}
                className={`cursor-pointer transition-all hover:shadow-md border-2`}
                style={{ borderColor: selectedBarber?.id === barber.id ? primaryColor : "transparent" }}
                onClick={() => setSelectedBarber(barber)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="rounded-full h-12 w-12 flex items-center justify-center text-base font-bold shrink-0"
                    style={{ backgroundColor: primaryColor, color: secondaryColor }}>
                    {barber.name.split(" ").slice(0, 2).map((n: string) => n[0].toUpperCase()).join("")}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{barber.name}</p>
                    {barber.specialties && (
                      <p className="text-sm text-muted-foreground">{barber.specialties}</p>
                    )}
                  </div>
                  {selectedBarber?.id === barber.id && (
                    <Check className="h-5 w-5" style={{ color: primaryColor }} />
                  )}
                </CardContent>
              </Card>
            ))}
            <Button className="w-full" disabled={!selectedBarber} onClick={() => setStep("service")}
              style={selectedBarber ? { backgroundColor: primaryColor, color: secondaryColor } : {}}>
              Continuar
            </Button>
          </div>
        )}

        {/* Passo 2: Serviço */}
        {step === "service" && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Escolha o serviço</h2>
            {services_?.map(service => (
              <Card
                key={service.id}
                className={`cursor-pointer transition-all hover:shadow-md border-2`}
                style={{ borderColor: selectedService?.id === service.id ? primaryColor : "transparent" }}
                onClick={() => setSelectedService(service)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-semibold">{service.name}</p>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{service.durationMinutes} min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      R$ {(service.priceInCents / 100).toFixed(2).replace(".", ",")}
                    </Badge>
                    {selectedService?.id === service.id && (
                      <Check className="h-5 w-5" style={{ color: primaryColor }} />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("barber")}>Voltar</Button>
              <Button className="flex-1" disabled={!selectedService} onClick={() => setStep("date")}
                style={selectedService ? { backgroundColor: primaryColor, color: secondaryColor } : {}}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Passo 3: Data */}
        {step === "date" && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Escolha a data</h2>
            {availableDates.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CalendarIcon className="h-10 w-10 mx-auto mb-2 opacity-50" />
                <p>Nenhuma data disponível para seu plano nos próximos 30 dias.</p>
              </div>
            )}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {availableDates.map(date => {
                const d = new Date(date + "T12:00:00");
                const dayName = d.toLocaleDateString("pt-BR", { weekday: "short" });
                const dayNum = d.getDate();
                const month = d.toLocaleDateString("pt-BR", { month: "short" });
                const isSelected = selectedDate === date;
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`p-3 rounded-lg border-2 text-center transition-all`}
                    style={isSelected
                      ? { backgroundColor: primaryColor, color: secondaryColor, borderColor: primaryColor }
                      : { borderColor: "transparent" }
                    }
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = primaryColor; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = "transparent"; }}
                  >
                    <p className="text-xs capitalize">{dayName}</p>
                    <p className="text-xl font-bold">{dayNum}</p>
                    <p className="text-xs capitalize">{month}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("service")}>Voltar</Button>
              <Button className="flex-1" disabled={!selectedDate} onClick={() => setStep("time")}
                style={selectedDate ? { backgroundColor: primaryColor, color: secondaryColor } : {}}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Passo 4: Horário */}
        {step === "time" && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Escolha o horário</h2>
            {slotsLoading ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots?.map(slot => {
                  const isSelected = selectedTime === slot.time;
                  return (
                    <button
                      key={slot.time}
                      disabled={!slot.available}
                      onClick={() => setSelectedTime(slot.time)}
                      className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                        !slot.available ? "opacity-30 cursor-not-allowed bg-muted" : ""
                      }`}
                      style={slot.available
                        ? isSelected
                          ? { backgroundColor: primaryColor, color: secondaryColor, borderColor: primaryColor }
                          : { borderColor: "transparent" }
                        : {}
                      }
                      onMouseEnter={e => { if (slot.available && !isSelected) e.currentTarget.style.borderColor = primaryColor; }}
                      onMouseLeave={e => { if (slot.available && !isSelected) e.currentTarget.style.borderColor = "transparent"; }}
                    >
                      {slot.time}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("date")}>Voltar</Button>
              <Button className="flex-1" disabled={!selectedTime} onClick={() => setStep("confirm")}
                style={selectedTime ? { backgroundColor: primaryColor, color: secondaryColor } : {}}>
                Continuar
              </Button>
            </div>
          </div>
        )}

        {/* Passo 5: Confirmar */}
        {step === "confirm" && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Confirmar Agendamento</h2>
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Barbeiro</p>
                    <p className="font-semibold">{selectedBarber?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Scissors className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Serviço</p>
                    <p className="font-semibold">{selectedService?.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <CalendarIcon className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Data e Horário</p>
                    <p className="font-semibold">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
                        weekday: "long", day: "numeric", month: "long"
                      })} às {selectedTime}
                    </p>
                  </div>
                </div>

                {me?.subscription && !isGuestBooking && (
                  <div className={`rounded-lg p-3 text-sm ${
                    isUnlimitedPlan
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : creditsRemaining > 0
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : "bg-red-50 border border-red-200 text-red-700"
                  }`}>
                    {isUnlimitedPlan
                      ? "✅ Plano ilimitado — sem débito de créditos"
                      : creditsRemaining > 0
                      ? `✅ Será usado 1 crédito do seu plano (${creditsRemaining} disponíveis)`
                      : "❌ Sem créditos disponíveis. Aguarde a renovação mensal."}
                  </div>
                )}

                {isGuestBooking && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                    👤 Agendamento para <strong>{guestName}</strong> — seus créditos não serão debitados
                  </div>
                )}

                {!me?.subscription && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    ⚠️ Sem plano ativo — agendamento ficará pendente até confirmação
                  </div>
                )}

                <textarea
                  placeholder="Observações (opcional)"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full border rounded-lg p-3 text-sm resize-none h-20 bg-background"
                />
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("time")}>Voltar</Button>
              <Button
                className="flex-1"
                onClick={handleConfirmClick}
                disabled={isBooking || (!isUnlimitedPlan && !!me?.subscription && creditsRemaining <= 0 && !isGuestBooking)}
                style={{ backgroundColor: primaryColor, color: secondaryColor }}
              >
                {isBooking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Agendando...</> : "Confirmar"}
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* ── Dialog: Agendando para você ou para outra pessoa? ──────────────── */}
      <Dialog open={showGuestDialog} onOpenChange={open => { if (!open && !isBooking) setShowGuestDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Para quem é este agendamento?
            </DialogTitle>
            <DialogDescription>
              Se for para outra pessoa (ex: seu filho), seus créditos não serão descontados.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {isGuestBooking && (
              <div className="space-y-2">
                <Label htmlFor="guestName">Nome de quem vai ao corte</Label>
                <Input
                  id="guestName"
                  placeholder="Ex: João (filho)"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {!isGuestBooking ? (
              <>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setIsGuestBooking(true);
                  }}
                >
                  Para outra pessoa
                </Button>
                <Button
                  className="flex-1"
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}
                  onClick={() => {
                    setIsGuestBooking(false);
                    setShowGuestDialog(false);
                    executeBooking();
                  }}
                >
                  Para mim
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setIsGuestBooking(false)}>
                  Voltar
                </Button>
                <Button
                  className="flex-1"
                  disabled={!guestName.trim()}
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}
                  onClick={() => handleGuestDialogConfirm(true)}
                >
                  Confirmar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
