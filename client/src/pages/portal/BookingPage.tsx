import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Clock, User, Scissors, CalendarIcon, Loader2 } from "lucide-react";
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

  const { data: me } = trpc.client.me.useQuery({ slug });
  const { data: barbers_ } = trpc.client.getBarbers.useQuery({ slug });
  const { data: services_ } = trpc.client.getServices.useQuery({ slug });
  const { data: slots } = trpc.client.getAvailableSlots.useQuery(
    { slug, barberId: selectedBarber?.id ?? 0, date: selectedDate },
    { enabled: !!selectedBarber && !!selectedDate }
  );

  const bookMutation = trpc.client.bookAppointment.useMutation({
    onSuccess: (data) => {
      toast.success("Agendamento confirmado!");
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center p-6 space-y-4">
          <Scissors className="h-12 w-12 mx-auto text-primary" />
          <h2 className="text-xl font-bold">Faça login para agendar</h2>
          <p className="text-muted-foreground text-sm">Você precisa ter uma conta para agendar.</p>
          <Button className="w-full" onClick={() => navigate(`/b/${slug}/login?redirect=agendar`)}>
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

  const handleBook = async () => {
    if (!selectedBarber || !selectedService || !selectedDate || !selectedTime) return;
    setIsBooking(true);
    const appointmentDate = new Date(`${selectedDate}T${selectedTime}:00`);
    const hasCredits = (me?.subscription?.subscription?.creditsRemaining ?? 0) > 0;
    bookMutation.mutate({
      slug,
      barberId: selectedBarber.id,
      serviceId: selectedService.id,
      appointmentDate,
      notes: notes || undefined,
      useSubscriptionCredit: hasCredits,
    });
  };

  // Gera próximos 14 dias úteis
  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    if (d.getDay() === 0) return null; // Remove domingo
    return d.toISOString().split("T")[0];
  }).filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/b/${slug}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="font-bold">Agendar</h1>
        </div>
      </header>

      {/* Progress */}
      <div className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div className={`h-2 flex-1 rounded-full transition-colors ${
                  i <= currentStepIndex ? "bg-primary" : "bg-muted"
                }`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Passo {currentStepIndex + 1} de {steps.length}: <span className="font-medium">{steps[currentStepIndex].label}</span>
          </p>
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
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedBarber?.id === barber.id ? "border-primary border-2" : ""
                }`}
                onClick={() => setSelectedBarber(barber)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="bg-muted rounded-full h-12 w-12 flex items-center justify-center">
                    <User className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{barber.name}</p>
                    {barber.specialties && (
                      <p className="text-sm text-muted-foreground">{barber.specialties}</p>
                    )}
                  </div>
                  {selectedBarber?.id === barber.id && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </CardContent>
              </Card>
            ))}
            <Button className="w-full" disabled={!selectedBarber} onClick={() => setStep("service")}>
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
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedService?.id === service.id ? "border-primary border-2" : ""
                }`}
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
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("barber")}>Voltar</Button>
              <Button className="flex-1" disabled={!selectedService} onClick={() => setStep("date")}>Continuar</Button>
            </div>
          </div>
        )}

        {/* Passo 3: Data */}
        {step === "date" && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Escolha a data</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {availableDates.map(date => {
                const d = new Date(date + "T12:00:00");
                const dayName = d.toLocaleDateString("pt-BR", { weekday: "short" });
                const dayNum = d.getDate();
                const month = d.toLocaleDateString("pt-BR", { month: "short" });
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className={`p-3 rounded-lg border text-center transition-all hover:border-primary ${
                      selectedDate === date ? "border-primary bg-primary text-primary-foreground" : ""
                    }`}
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
              <Button className="flex-1" disabled={!selectedDate} onClick={() => setStep("time")}>Continuar</Button>
            </div>
          </div>
        )}

        {/* Passo 4: Horário */}
        {step === "time" && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">Escolha o horário</h2>
            <div className="grid grid-cols-4 gap-2">
              {slots?.map(slot => (
                <button
                  key={slot.time}
                  disabled={!slot.available}
                  onClick={() => setSelectedTime(slot.time)}
                  className={`p-3 rounded-lg border text-sm font-medium transition-all ${
                    !slot.available
                      ? "opacity-30 cursor-not-allowed bg-muted"
                      : selectedTime === slot.time
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:border-primary"
                  }`}
                >
                  {slot.time}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("date")}>Voltar</Button>
              <Button className="flex-1" disabled={!selectedTime} onClick={() => setStep("confirm")}>Continuar</Button>
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

                {me?.subscription && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                    ✅ Será usado 1 crédito do seu plano ({me.subscription.subscription.creditsRemaining} disponíveis)
                  </div>
                )}

                {!me?.subscription && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                    ⚠️ Sem plano ativo — agendamento ficará pendente até confirmação manual
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
              <Button className="flex-1" onClick={handleBook} disabled={isBooking}>
                {isBooking ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Agendando...</> : "Confirmar"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
