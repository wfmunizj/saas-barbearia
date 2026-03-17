import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, Clock, User, Scissors, CalendarIcon, Loader2, Users, CreditCard, Store,
} from "lucide-react";
import { toast } from "sonner";

type Step = "barber" | "plan" | "service" | "date" | "time" | "confirm";

const STEPS: { key: Step; label: string }[] = [
  { key: "barber", label: "Equipe" },
  { key: "plan", label: "Plano" },
  { key: "service", label: "Serviço" },
  { key: "date", label: "Data" },
  { key: "time", label: "Horário" },
  { key: "confirm", label: "Confirmar" },
];

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const [step, setStep] = useState<Step>("barber");
  const [selectedBarber, setSelectedBarber] = useState<any>(null);
  const [selectedServices, setSelectedServices] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedTime, setSelectedTime] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isBooking, setIsBooking] = useState(false);

  const [showGuestDialog, setShowGuestDialog] = useState(false);
  const [isGuestBooking, setIsGuestBooking] = useState(false);
  const [guestName, setGuestName] = useState("");

  const queryClient = useQueryClient();

  const { data: barbershop } = trpc.clientPortal.getBarbershop.useQuery({ slug });
  const { data: me } = trpc.clientPortal.me.useQuery({ slug });
  const { data: barbers_ } = trpc.clientPortal.getBarbers.useQuery({ slug });
  const { data: services_ } = trpc.clientPortal.getServices.useQuery({ slug });
  const { data: plans_ } = trpc.clientPortal.getPlans.useQuery({ slug });
  const { data: slots, isLoading: slotsLoading } = trpc.clientPortal.getAvailableSlots.useQuery(
    { slug, barberId: selectedBarber?.id ?? 0, date: selectedDate },
    { enabled: !!selectedBarber && !!selectedDate }
  );

  const primaryColor = barbershop?.primaryColor ?? "#C9A84C";
  const secondaryColor = barbershop?.secondaryColor ?? "#000000";

  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.priceInCents ?? 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0);

  const bookMutation = trpc.clientPortal.bookAppointment.useMutation({
    onSuccess: (data) => {
      if ((data as any).checkoutUrl) {
        window.location.href = (data as any).checkoutUrl;
        return;
      }
      if (isGuestBooking) {
        toast.success(`Agendamento confirmado para ${guestName}!`);
      } else {
        toast.success("Agendamento confirmado!");
      }
      queryClient.invalidateQueries({ queryKey: [["client", "me"]] });
      navigate(`/b/${slug}/minha-conta`);
    },
    onError: (err) => {
      toast.error(err.message);
      setIsBooking(false);
    },
  });

  const allowedDaysOfWeek: number[] | null = (() => {
    const raw = (me?.subscription?.plan as any)?.allowedDaysOfWeek;
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  })();

  const isUnlimitedPlan = (me?.subscription?.plan as any)?.isUnlimited ?? false;
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const planDayLabel = allowedDaysOfWeek
    ? allowedDaysOfWeek.map((d) => dayNames[d]).join(", ")
    : null;

  const availableDates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    const dow = d.getDay();
    if (dow === 0) return null;
    if (allowedDaysOfWeek && !allowedDaysOfWeek.includes(dow)) return null;
    return d.toISOString().split("T")[0];
  }).filter(Boolean) as string[];

  const handleConfirmClick = (method?: "in_person" | "mp") => {
    if (me?.subscription && !isGuestBooking && !showGuestDialog && method === undefined) {
      setShowGuestDialog(true);
      return;
    }
    executeBooking(method ?? "in_person");
  };

  const executeBooking = (method: "in_person" | "mp" = "in_person") => {
    if (!selectedBarber || selectedServices.length === 0 || !selectedDate || !selectedTime) return;
    setIsBooking(true);
    const appointmentDate = new Date(`${selectedDate}T${selectedTime}:00`);
    const hasSubscription = !!me?.subscription;
    bookMutation.mutate({
      slug,
      barberId: selectedBarber.id,
      serviceIds: selectedServices.map((s) => s.id),
      appointmentDate,
      notes: notes || undefined,
      useSubscriptionCredit: hasSubscription && !isGuestBooking,
      isGuestBooking,
      guestName: isGuestBooking ? guestName : undefined,
      paymentMethod: hasSubscription || isGuestBooking ? "in_person" : method,
    });
  };

  const handleGuestDialogConfirm = (forGuest: boolean) => {
    setIsGuestBooking(forGuest);
    if (forGuest && !guestName.trim()) return;
    setShowGuestDialog(false);
    executeBooking("in_person");
  };

  const creditsRemaining = me?.subscription?.subscription?.creditsRemaining ?? 0;
  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  // ── Glass card style ──────────────────────────────────────────────────────
  const glassCard = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
  } as React.CSSProperties;

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!me?.user) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center p-5"
        style={{ backgroundColor: "#0a0a0a", fontFamily: "'Jost', sans-serif" }}
      >
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center space-y-5"
          style={glassCard}
        >
          <div
            className="h-16 w-16 rounded-[18px] mx-auto flex items-center justify-center"
            style={{
              backgroundColor: primaryColor,
              boxShadow: `0 0 50px ${primaryColor}35`,
            }}
          >
            <Scissors className="h-8 w-8" style={{ color: secondaryColor }} />
          </div>
          <div>
            <h2
              className="text-xl font-bold text-white mb-1"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Faça login para agendar
            </h2>
            <p className="text-white/40 text-sm">Você precisa ter uma conta para agendar.</p>
          </div>
          <div className="space-y-2 pt-1">
            <button
              className="w-full py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200"
              style={{
                backgroundColor: primaryColor,
                color: secondaryColor,
                boxShadow: `0 4px 25px ${primaryColor}30`,
              }}
              onClick={() => navigate(`/b/${slug}/login?redirect=agendar`)}
            >
              Entrar
            </button>
            <button
              className="w-full py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/70 hover:text-white"
              style={{ border: "1px solid rgba(255,255,255,0.12)" }}
              onClick={() => navigate(`/b/${slug}/cadastro?redirect=agendar`)}
            >
              Criar conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-dvh"
      style={{ backgroundColor: "#0a0a0a", fontFamily: "'Jost', sans-serif" }}
    >
      {/* Glow orb */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 pointer-events-none z-0"
        style={{
          width: "600px",
          height: "400px",
          background: `radial-gradient(ellipse at 50% 0%, ${primaryColor}20 0%, transparent 65%)`,
          filter: "blur(30px)",
        }}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => navigate(`/b/${slug}`)}
            className="h-9 w-9 rounded-xl flex items-center justify-center text-white/50 hover:text-white hover:bg-white/8 transition-all duration-200 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span
            className="font-bold text-white"
            style={{ fontFamily: "'Jost', sans-serif" }}
          >
            Agendar
          </span>
          {barbershop?.name && (
            <span className="text-white/30 text-sm hidden sm:inline">· {barbershop.name}</span>
          )}
        </div>
      </header>

      {/* ── Step Progress ────────────────────────────────────────────────── */}
      <div
        className="sticky top-14 z-30"
        style={{
          background: "rgba(10,10,10,0.80)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center">
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                    style={
                      i < currentStepIndex
                        ? { backgroundColor: primaryColor, color: secondaryColor }
                        : i === currentStepIndex
                        ? {
                            backgroundColor: primaryColor,
                            color: secondaryColor,
                            boxShadow: `0 0 14px ${primaryColor}50`,
                          }
                        : {
                            background: "rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.25)",
                          }
                    }
                  >
                    {i < currentStepIndex ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className="text-[10px] hidden sm:block transition-colors duration-200"
                    style={{ color: i <= currentStepIndex ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.2)" }}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className="flex-1 h-px mx-2 mb-3 sm:mb-0 transition-all duration-500"
                    style={{
                      backgroundColor:
                        i < currentStepIndex ? primaryColor : "rgba(255,255,255,0.08)",
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          {planDayLabel && (
            <p className="text-xs mt-2 px-1" style={{ color: `${primaryColor}99` }}>
              Seu plano permite: {planDayLabel}
            </p>
          )}
        </div>
      </div>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 relative z-10">

        {/* ── Step 1: Barbeiro ─────────────────────────────────────────── */}
        {step === "barber" && (
          <div className="space-y-3 portal-step-animate">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Escolha o barbeiro
            </h2>
            {barbers_?.map((barber) => {
              const isSelected = selectedBarber?.id === barber.id;
              return (
                <button
                  key={barber.id}
                  onClick={() => setSelectedBarber(barber)}
                  className="w-full text-left p-4 rounded-2xl transition-all duration-200 flex items-center gap-4 cursor-pointer"
                  style={{
                    background: isSelected
                      ? `${primaryColor}15`
                      : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${isSelected ? primaryColor : "rgba(255,255,255,0.08)"}`,
                    boxShadow: isSelected ? `0 0 28px ${primaryColor}18` : "none",
                  }}
                >
                  <div
                    className="h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all duration-200"
                    style={{
                      backgroundColor: isSelected ? primaryColor : "rgba(255,255,255,0.1)",
                      color: isSelected ? secondaryColor : "rgba(255,255,255,0.7)",
                    }}
                  >
                    {barber.name.split(" ").slice(0, 2).map((n: string) => n[0].toUpperCase()).join("")}
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-white">{barber.name}</p>
                    {barber.specialties && (
                      <p className="text-sm text-white/40 mt-0.5">{barber.specialties}</p>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                  )}
                </button>
              );
            })}
            {/* Aviso: barbeiro diferente do plano */}
            {selectedBarber && me?.subscription?.subscription?.primaryBarberId &&
             selectedBarber.id !== me.subscription.subscription.primaryBarberId && (
              <div className="rounded-xl p-3 text-sm" style={{ background: "rgba(255, 200, 50, 0.12)", border: "1px solid rgba(255, 200, 50, 0.3)" }}>
                <p className="font-semibold" style={{ color: "#fbbf24" }}>Barbeiro diferente do seu plano</p>
                <p className="mt-0.5 text-white/60 text-xs">
                  Você está agendando com um barbeiro diferente do seu plano habitual. O repasse será calculado normalmente para quem realizar o atendimento.
                </p>
              </div>
            )}
            <button
              disabled={!selectedBarber}
              onClick={() => setStep("plan")}
              className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40 mt-2"
              style={
                selectedBarber
                  ? {
                      backgroundColor: primaryColor,
                      color: secondaryColor,
                      boxShadow: `0 4px 25px ${primaryColor}28`,
                    }
                  : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }
              }
            >
              Continuar
            </button>
          </div>
        )}

        {/* ── Step 2: Plano ────────────────────────────────────────────── */}
        {step === "plan" && (
          <div className="space-y-3 portal-step-animate">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Plano de assinatura
            </h2>

            {/* Plano ativo do cliente */}
            {me?.subscription && (
              <div
                className="p-4 rounded-2xl"
                style={{
                  background: `${primaryColor}12`,
                  border: `1.5px solid ${primaryColor}40`,
                }}
              >
                <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Seu plano atual</p>
                <p className="font-bold text-white">{(me.subscription.plan as any)?.name}</p>
                <p className="text-xs mt-1" style={{ color: `${primaryColor}cc` }}>
                  {isUnlimitedPlan
                    ? "Plano ilimitado — use este agendamento"
                    : `${creditsRemaining} crédito${creditsRemaining !== 1 ? "s" : ""} disponíve${creditsRemaining !== 1 ? "is" : "l"}`}
                </p>
              </div>
            )}

            {/* Planos disponíveis */}
            {!me?.subscription && plans_ && plans_.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-white/40 uppercase tracking-wider">Planos disponíveis</p>
                {plans_.map((plan: any) => (
                  <div
                    key={plan.id}
                    className="p-4 rounded-2xl"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1.5px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">{plan.name}</p>
                        {plan.description && (
                          <p className="text-xs text-white/40 mt-0.5">{plan.description}</p>
                        )}
                      </div>
                      <span
                        className="text-sm font-bold px-3 py-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                      >
                        R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}
                        <span className="text-[10px] text-white/30">/mês</span>
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-white/30 text-center pt-1">
                  Para assinar um plano, acesse <span style={{ color: primaryColor }}>Minha Conta</span>
                </p>
              </div>
            )}

            {!me?.subscription && (!plans_ || plans_.length === 0) && (
              <p className="text-sm text-white/30 text-center py-4">Nenhum plano disponível — agendamento avulso</p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setStep("barber")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/60 hover:text-white/90"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Voltar
              </button>
              <button
                onClick={() => setStep("service")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: primaryColor,
                  color: secondaryColor,
                  boxShadow: `0 4px 25px ${primaryColor}28`,
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Serviço ──────────────────────────────────────────── */}
        {step === "service" && (
          <div className="space-y-3 portal-step-animate">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Escolha o(s) serviço(s)
            </h2>
            {services_?.map((service) => {
              const isSelected = selectedServices.some((s) => s.id === service.id);
              return (
                <button
                  key={service.id}
                  onClick={() =>
                    setSelectedServices((prev) =>
                      prev.some((s) => s.id === service.id)
                        ? prev.filter((s) => s.id !== service.id)
                        : [...prev, service]
                    )
                  }
                  className="w-full text-left p-4 rounded-2xl transition-all duration-200 flex items-center justify-between cursor-pointer"
                  style={{
                    background: isSelected ? `${primaryColor}15` : "rgba(255,255,255,0.04)",
                    border: `1.5px solid ${isSelected ? primaryColor : "rgba(255,255,255,0.08)"}`,
                    boxShadow: isSelected ? `0 0 28px ${primaryColor}18` : "none",
                  }}
                >
                  <div>
                    <p className="font-semibold text-white">{service.name}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-white/40 text-xs">
                      <Clock className="h-3 w-3" />
                      <span>{service.durationMinutes} min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm font-bold px-3 py-1.5 rounded-full"
                      style={{
                        backgroundColor: isSelected ? `${primaryColor}20` : "rgba(255,255,255,0.08)",
                        color: isSelected ? primaryColor : "rgba(255,255,255,0.7)",
                      }}
                    >
                      R$ {(service.priceInCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                    {isSelected && (
                      <Check className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                    )}
                  </div>
                </button>
              );
            })}

            {selectedServices.length > 0 && (
              <div
                className="p-3 rounded-xl text-sm text-center"
                style={{
                  background: `${primaryColor}10`,
                  border: `1px solid ${primaryColor}25`,
                }}
              >
                <span className="font-semibold" style={{ color: primaryColor }}>
                  {selectedServices.length} serviço(s)
                </span>
                <span className="text-white/50"> · {totalDuration} min · </span>
                <span className="font-semibold text-white">
                  R$ {(totalPrice / 100).toFixed(2).replace(".", ",")}
                </span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setSelectedServices([]); setStep("plan"); }}
                className="flex-1 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/60 hover:text-white/90"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Voltar
              </button>
              <button
                disabled={selectedServices.length === 0}
                onClick={() => { if (selectedServices.length === 0) return; setStep("date"); }}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40"
                style={
                  selectedServices.length > 0
                    ? {
                        backgroundColor: primaryColor,
                        color: secondaryColor,
                        boxShadow: `0 4px 25px ${primaryColor}28`,
                      }
                    : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }
                }
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Data ─────────────────────────────────────────────── */}
        {step === "date" && (
          <div className="space-y-3 portal-step-animate">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Escolha a data
            </h2>
            {availableDates.length === 0 && (
              <div className="text-center py-10 text-white/30">
                <CalendarIcon className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Nenhuma data disponível para seu plano nos próximos 30 dias.</p>
              </div>
            )}
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {availableDates.map((date) => {
                const d = new Date(date + "T12:00:00");
                const dayName = d.toLocaleDateString("pt-BR", { weekday: "short" });
                const dayNum = d.getDate();
                const month = d.toLocaleDateString("pt-BR", { month: "short" });
                const isSelected = selectedDate === date;
                return (
                  <button
                    key={date}
                    onClick={() => setSelectedDate(date)}
                    className="p-2.5 rounded-xl text-center transition-all duration-200 cursor-pointer"
                    style={
                      isSelected
                        ? {
                            backgroundColor: primaryColor,
                            color: secondaryColor,
                            boxShadow: `0 4px 20px ${primaryColor}30`,
                            border: `1.5px solid ${primaryColor}`,
                          }
                        : {
                            background: "rgba(255,255,255,0.04)",
                            border: "1.5px solid rgba(255,255,255,0.08)",
                            color: "rgba(255,255,255,0.75)",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.borderColor = `${primaryColor}60`;
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected)
                        e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    }}
                  >
                    <p className="text-[10px] capitalize opacity-70">{dayName}</p>
                    <p className="text-lg font-bold leading-tight">{dayNum}</p>
                    <p className="text-[10px] capitalize opacity-70">{month}</p>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("service")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/60 hover:text-white/90"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Voltar
              </button>
              <button
                disabled={!selectedDate}
                onClick={() => setStep("time")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40"
                style={
                  selectedDate
                    ? {
                        backgroundColor: primaryColor,
                        color: secondaryColor,
                        boxShadow: `0 4px 25px ${primaryColor}28`,
                      }
                    : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }
                }
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Horário ───────────────────────────────────────────── */}
        {step === "time" && (
          <div className="space-y-3 portal-step-animate">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Escolha o horário
            </h2>
            {slotsLoading ? (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="h-12 rounded-xl animate-pulse"
                    style={{ background: "rgba(255,255,255,0.07)" }}
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                {slots?.map((slot) => {
                  const isSelected = selectedTime === slot.time;
                  return (
                    <button
                      key={slot.time}
                      disabled={!slot.available}
                      onClick={() => setSelectedTime(slot.time)}
                      className="py-3 px-2 rounded-xl text-sm font-semibold transition-all duration-200 text-center"
                      style={
                        !slot.available
                          ? {
                              background: "rgba(255,255,255,0.03)",
                              border: "1.5px solid rgba(255,255,255,0.05)",
                              color: "rgba(255,255,255,0.15)",
                              cursor: "not-allowed",
                              textDecoration: "line-through",
                            }
                          : isSelected
                          ? {
                              backgroundColor: primaryColor,
                              color: secondaryColor,
                              border: `1.5px solid ${primaryColor}`,
                              boxShadow: `0 4px 20px ${primaryColor}30`,
                              cursor: "pointer",
                            }
                          : {
                              background: "rgba(255,255,255,0.05)",
                              border: "1.5px solid rgba(255,255,255,0.09)",
                              color: "rgba(255,255,255,0.75)",
                              cursor: "pointer",
                            }
                      }
                      onMouseEnter={(e) => {
                        if (slot.available && !isSelected)
                          e.currentTarget.style.borderColor = `${primaryColor}60`;
                      }}
                      onMouseLeave={(e) => {
                        if (slot.available && !isSelected)
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)";
                      }}
                    >
                      {slot.time}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setStep("date")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/60 hover:text-white/90"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Voltar
              </button>
              <button
                disabled={!selectedTime}
                onClick={() => setStep("confirm")}
                className="flex-1 py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-40"
                style={
                  selectedTime
                    ? {
                        backgroundColor: primaryColor,
                        color: secondaryColor,
                        boxShadow: `0 4px 25px ${primaryColor}28`,
                      }
                    : { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }
                }
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Confirmar ─────────────────────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-4 portal-step-animate">
            <h2
              className="text-xl font-bold text-white"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Confirmar Agendamento
            </h2>

            {/* Summary card */}
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Barbeiro */}
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${primaryColor}18` }}
                >
                  <User className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className="text-[11px] text-white/35 uppercase tracking-wider">Barbeiro</p>
                  <p className="font-semibold text-white text-sm">{selectedBarber?.name}</p>
                </div>
              </div>

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Serviços */}
              <div className="flex items-start gap-3">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${primaryColor}18` }}
                >
                  <Scissors className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] text-white/35 uppercase tracking-wider">Serviço(s)</p>
                  <div className="space-y-1 mt-0.5">
                    {selectedServices.map((s) => (
                      <div key={s.id} className="flex justify-between text-sm">
                        <span className="font-medium text-white">{s.name}</span>
                        <span className="text-white/40">
                          {s.durationMinutes}min · R$ {(s.priceInCents / 100).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    ))}
                    {selectedServices.length > 1 && (
                      <div
                        className="flex justify-between text-sm font-bold pt-1 mt-1"
                        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
                      >
                        <span className="text-white">Total</span>
                        <span style={{ color: primaryColor }}>
                          {totalDuration}min · R$ {(totalPrice / 100).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />

              {/* Data/hora */}
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${primaryColor}18` }}
                >
                  <CalendarIcon className="h-4 w-4" style={{ color: primaryColor }} />
                </div>
                <div>
                  <p className="text-[11px] text-white/35 uppercase tracking-wider">Data e Horário</p>
                  <p className="font-semibold text-white text-sm">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}{" "}
                    às {selectedTime}
                  </p>
                </div>
              </div>

              {/* Plan credit info */}
              {me?.subscription && !isGuestBooking && (
                <div
                  className="rounded-xl p-3 text-sm"
                  style={{
                    background: isUnlimitedPlan || creditsRemaining > 0
                      ? "rgba(34,197,94,0.08)"
                      : "rgba(239,68,68,0.08)",
                    border: `1px solid ${isUnlimitedPlan || creditsRemaining > 0
                      ? "rgba(34,197,94,0.2)"
                      : "rgba(239,68,68,0.2)"}`,
                    color: isUnlimitedPlan || creditsRemaining > 0
                      ? "rgba(134,239,172,0.9)"
                      : "rgba(252,165,165,0.9)",
                  }}
                >
                  {isUnlimitedPlan
                    ? "Plano ilimitado — sem débito de créditos"
                    : creditsRemaining > 0
                    ? `Será usado 1 crédito do seu plano (${creditsRemaining} disponíveis)`
                    : "Sem créditos disponíveis. Aguarde a renovação mensal."}
                </div>
              )}

              {isGuestBooking && (
                <div
                  className="rounded-xl p-3 text-sm"
                  style={{
                    background: "rgba(59,130,246,0.08)",
                    border: "1px solid rgba(59,130,246,0.2)",
                    color: "rgba(147,197,253,0.9)",
                  }}
                >
                  Agendamento para <strong>{guestName}</strong> — seus créditos não serão debitados
                </div>
              )}

              {/* Payment options — sem assinatura */}
              {!me?.subscription && !isGuestBooking && (
                <div className="space-y-3">
                  <div className="h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <p className="text-sm font-semibold text-white/70">Como você vai pagar?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleConfirmClick("in_person")}
                      disabled={isBooking}
                      className="p-3.5 rounded-xl text-sm font-semibold flex flex-col items-center gap-1.5 transition-all duration-200 cursor-pointer disabled:opacity-50"
                      style={{
                        border: `1.5px solid ${primaryColor}50`,
                        color: primaryColor,
                        background: `${primaryColor}08`,
                      }}
                    >
                      <Store className="h-5 w-5" />
                      Pagar na barbearia
                    </button>
                    <button
                      onClick={() => handleConfirmClick("mp")}
                      disabled={isBooking}
                      className="p-3.5 rounded-xl text-sm font-semibold flex flex-col items-center gap-1.5 transition-all duration-200 cursor-pointer disabled:opacity-50"
                      style={{
                        backgroundColor: primaryColor,
                        color: secondaryColor,
                        boxShadow: `0 4px 20px ${primaryColor}28`,
                      }}
                    >
                      {isBooking ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <CreditCard className="h-5 w-5" />
                      )}
                      Pagar via Mercado Pago
                    </button>
                  </div>
                  <p className="text-xs text-white/30 text-center">
                    Valor: R$ {(totalPrice / 100).toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}

              {/* Notes */}
              <textarea
                placeholder="Observações (opcional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="portal-dark-textarea w-full rounded-xl p-3.5 text-sm resize-none text-white transition-all duration-200"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  outline: "none",
                }}
              />
            </div>

            {/* Confirm / Back buttons */}
            {(me?.subscription || isGuestBooking) && (
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("time")}
                  className="flex-1 py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/60 hover:text-white/90"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Voltar
                </button>
                <button
                  onClick={() => handleConfirmClick()}
                  disabled={
                    isBooking ||
                    (!isUnlimitedPlan && !!me?.subscription && creditsRemaining <= 0 && !isGuestBooking)
                  }
                  className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  style={{
                    backgroundColor: primaryColor,
                    color: secondaryColor,
                    boxShadow: `0 4px 25px ${primaryColor}28`,
                  }}
                >
                  {isBooking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Agendando...
                    </>
                  ) : (
                    "Confirmar"
                  )}
                </button>
              </div>
            )}
            {!me?.subscription && !isGuestBooking && (
              <button
                onClick={() => setStep("time")}
                className="w-full py-3 rounded-xl font-semibold text-sm cursor-pointer transition-all duration-200 text-white/60 hover:text-white/90"
                style={{ border: "1px solid rgba(255,255,255,0.1)" }}
              >
                Voltar
              </button>
            )}
          </div>
        )}
      </main>

      {/* ── Guest Dialog ──────────────────────────────────────────────────── */}
      <Dialog
        open={showGuestDialog}
        onOpenChange={(open) => { if (!open && !isBooking) setShowGuestDialog(false); }}
      >
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
                  onChange={(e) => setGuestName(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {!isGuestBooking ? (
              <>
                <button
                  className="flex-1 py-2.5 rounded-lg border text-sm font-medium cursor-pointer"
                  onClick={() => setIsGuestBooking(true)}
                >
                  Para outra pessoa
                </button>
                <button
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}
                  onClick={() => {
                    setIsGuestBooking(false);
                    setShowGuestDialog(false);
                    executeBooking("in_person");
                  }}
                >
                  Para mim
                </button>
              </>
            ) : (
              <>
                <button
                  className="py-2.5 px-4 rounded-lg border text-sm font-medium cursor-pointer"
                  onClick={() => setIsGuestBooking(false)}
                >
                  Voltar
                </button>
                <button
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                  disabled={!guestName.trim()}
                  style={{ backgroundColor: primaryColor, color: secondaryColor }}
                  onClick={() => handleGuestDialogConfirm(true)}
                >
                  Confirmar
                </button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
