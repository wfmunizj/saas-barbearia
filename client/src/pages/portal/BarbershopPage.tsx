import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Scissors, Clock, Star, ChevronRight, User, LogIn, Infinity, Phone, MapPin,
} from "lucide-react";

export default function BarbershopPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const { data: barbershop, isLoading: loadingShop } = trpc.client.getBarbershop.useQuery({ slug });
  const { data: plans, isLoading: loadingPlans } = trpc.client.getPlans.useQuery({ slug });
  const { data: barbers_, isLoading: loadingBarbers } = trpc.client.getBarbers.useQuery({ slug });
  const { data: services_, isLoading: loadingServices } = trpc.client.getServices.useQuery({ slug });
  const { data: me } = trpc.client.me.useQuery({ slug });
  const [hoveredPlan, setHoveredPlan] = useState<number | null>(null);
  const [hoveredService, setHoveredService] = useState<number | null>(null);

  if (loadingShop) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div className="space-y-4 w-full max-w-4xl px-6">
          <div
            className="h-14 rounded-2xl animate-pulse"
            style={{ background: "rgba(255,255,255,0.06)" }}
          />
          <div
            className="h-48 rounded-3xl animate-pulse"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
        </div>
      </div>
    );
  }

  if (!barbershop) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center"
        style={{ backgroundColor: "#0a0a0a" }}
      >
        <div className="text-center space-y-2">
          <h1
            className="text-2xl font-bold text-white"
            style={{ fontFamily: "'Bodoni Moda', serif" }}
          >
            Barbearia não encontrada
          </h1>
          <p className="text-white/40 text-sm">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  const primaryColor = barbershop.primaryColor ?? "#C9A84C";
  const secondaryColor = barbershop.secondaryColor ?? "#000000";

  const glassCard = {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
  } as React.CSSProperties;

  return (
    <div
      className="min-h-dvh relative"
      style={{ backgroundColor: "#0a0a0a", fontFamily: "'Jost', sans-serif" }}
    >
      {/* Background glow orbs */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 pointer-events-none z-0"
        style={{
          width: "800px",
          height: "600px",
          background: `radial-gradient(ellipse at 50% 0%, ${primaryColor}20 0%, transparent 65%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        className="fixed bottom-0 right-0 pointer-events-none z-0"
        style={{
          width: "500px",
          height: "500px",
          background: `radial-gradient(ellipse at 100% 100%, ${primaryColor}0d 0%, transparent 65%)`,
          filter: "blur(60px)",
        }}
      />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.88)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo + Name */}
          <div className="flex items-center gap-3">
            {barbershop.logoUrl ? (
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: primaryColor }}
              >
                <img src={barbershop.logoUrl} className="h-7 w-7 object-contain" alt={barbershop.name} />
              </div>
            ) : (
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <Scissors className="h-4 w-4" style={{ color: secondaryColor }} />
              </div>
            )}
            <span
              className="font-bold text-white text-base"
              style={{ fontFamily: "'Jost', sans-serif" }}
            >
              {barbershop.name}
            </span>
          </div>

          {/* Auth buttons */}
          {me?.user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-white/40 hidden sm:inline">
                Olá, {me.user.name?.split(" ")[0]}
              </span>
              <button
                onClick={() => navigate(`/b/${slug}/minha-conta`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer"
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "rgba(255,255,255,0.8)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = `${primaryColor}60`)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")}
              >
                <User className="h-4 w-4" />
                Minha Conta
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(`/b/${slug}/login`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white/50 hover:text-white/80 transition-colors duration-200 cursor-pointer"
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Entrar</span>
              </button>
              <button
                onClick={() => navigate(`/b/${slug}/cadastro`)}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer"
                style={{
                  backgroundColor: primaryColor,
                  color: secondaryColor,
                  boxShadow: `0 2px 16px ${primaryColor}28`,
                }}
              >
                Cadastrar
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-12 space-y-16 relative z-10">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <section className="text-center space-y-6 pt-4 portal-animate-in">
          <div className="space-y-3">
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              {barbershop.name}
            </h1>

            <div className="flex items-center justify-center gap-4 flex-wrap">
              {barbershop.address && (
                <span className="flex items-center gap-1.5 text-sm text-white/40">
                  <MapPin className="h-3.5 w-3.5" />
                  {barbershop.address}
                </span>
              )}
              {barbershop.phone && (
                <a
                  href={`tel:${barbershop.phone.replace(/\D/g, "")}`}
                  className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white/70 transition-colors"
                >
                  <Phone className="h-3.5 w-3.5" />
                  {barbershop.phone}
                </a>
              )}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate(`/b/${slug}/agendar`)}
              className="px-8 py-4 rounded-2xl font-bold text-base inline-flex items-center gap-2.5 transition-all duration-300 cursor-pointer"
              style={{
                backgroundColor: primaryColor,
                color: secondaryColor,
                boxShadow: `0 4px 40px ${primaryColor}38, 0 2px 12px ${primaryColor}20`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 6px 50px ${primaryColor}50, 0 2px 16px ${primaryColor}30`;
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 4px 40px ${primaryColor}38, 0 2px 12px ${primaryColor}20`;
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              Agendar Agora
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Thin divider */}
          <div className="flex items-center gap-4 max-w-xs mx-auto pt-2">
            <div className="h-px flex-1" style={{ background: `${primaryColor}25` }} />
            <div className="h-1 w-1 rounded-full" style={{ background: `${primaryColor}60` }} />
            <div className="h-px flex-1" style={{ background: `${primaryColor}25` }} />
          </div>
        </section>

        {/* ── Planos ──────────────────────────────────────────────────────── */}
        {(loadingPlans || (plans && plans.length > 0)) && (
          <section className="space-y-6 portal-animate-in-delay">
            <div className="text-center space-y-1">
              <h2
                className="text-3xl font-bold text-white"
                style={{ fontFamily: "'Bodoni Moda', serif" }}
              >
                Planos Mensais
              </h2>
              <p className="text-white/40 text-sm">Assine e economize com agendamentos recorrentes</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {loadingPlans
                ? [1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-52 rounded-2xl animate-pulse"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                  ))
                : plans!.map((plan) => {
                    const isUnlimited = (plan as any).isUnlimited ?? false;
                    const isHovered = hoveredPlan === plan.id;
                    return (
                      <div
                        key={plan.id}
                        className="rounded-2xl p-6 space-y-4 transition-all duration-300 cursor-pointer"
                        style={{
                          background: isHovered
                            ? `${primaryColor}10`
                            : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${isHovered ? primaryColor + "60" : "rgba(255,255,255,0.08)"}`,
                          boxShadow: isHovered ? `0 0 30px ${primaryColor}14` : "none",
                        }}
                        onMouseEnter={() => setHoveredPlan(plan.id)}
                        onMouseLeave={() => setHoveredPlan(null)}
                      >
                        <div>
                          <h3
                            className="font-bold text-white text-lg"
                            style={{ fontFamily: "'Bodoni Moda', serif" }}
                          >
                            {plan.name}
                          </h3>
                          {plan.description && (
                            <p className="text-white/40 text-sm mt-1">{plan.description}</p>
                          )}
                        </div>

                        <div>
                          <span
                            className="text-4xl font-bold"
                            style={{ color: isHovered ? primaryColor : "white" }}
                          >
                            R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}
                          </span>
                          <span className="text-white/35 text-sm ml-1">/mês</span>
                        </div>

                        <div className="flex items-center gap-2 text-sm text-white/50">
                          {isUnlimited ? (
                            <>
                              <Infinity className="h-4 w-4" style={{ color: primaryColor }} />
                              <span>Agendamentos ilimitados</span>
                            </>
                          ) : (
                            <>
                              <Star className="h-4 w-4 text-yellow-400" />
                              <span>
                                {plan.creditsPerMonth} agendamento
                                {plan.creditsPerMonth > 1 ? "s" : ""} por mês
                              </span>
                            </>
                          )}
                        </div>

                        <button
                          className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer"
                          style={{
                            backgroundColor: isHovered ? primaryColor : "rgba(255,255,255,0.08)",
                            color: isHovered ? secondaryColor : "rgba(255,255,255,0.7)",
                            boxShadow: isHovered ? `0 4px 20px ${primaryColor}28` : "none",
                          }}
                          onClick={() => {
                            if (!me?.user) {
                              navigate(`/b/${slug}/cadastro?planId=${plan.id}`);
                            } else {
                              navigate(`/b/${slug}/assinar/${plan.id}`);
                            }
                          }}
                        >
                          {me?.subscription ? "Trocar Plano" : "Assinar"}
                        </button>
                      </div>
                    );
                  })}
            </div>
          </section>
        )}

        {/* ── Barbeiros ───────────────────────────────────────────────────── */}
        {(loadingBarbers || (barbers_ && barbers_.length > 0)) && (
          <section className="space-y-6">
            <h2
              className="text-3xl font-bold text-white text-center"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Nossa Equipe
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {loadingBarbers
                ? [1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-32 rounded-2xl animate-pulse"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                  ))
                : barbers_!.map((barber) => (
                    <div
                      key={barber.id}
                      className="rounded-2xl p-5 text-center transition-all duration-300"
                      style={glassCard}
                    >
                      <div
                        className="h-16 w-16 mx-auto mb-3 rounded-full flex items-center justify-center text-lg font-bold"
                        style={{ backgroundColor: primaryColor, color: secondaryColor }}
                      >
                        {barber.name
                          .split(" ")
                          .slice(0, 2)
                          .map((n: string) => n[0].toUpperCase())
                          .join("")}
                      </div>
                      <p className="font-semibold text-white text-sm">{barber.name}</p>
                      {barber.specialties && (
                        <p className="text-xs text-white/35 mt-1">{barber.specialties}</p>
                      )}
                    </div>
                  ))}
            </div>
          </section>
        )}

        {/* ── Serviços ──────────────────────────────────────────────────────── */}
        {(loadingServices || (services_ && services_.length > 0)) && (
          <section className="space-y-6">
            <h2
              className="text-3xl font-bold text-white text-center"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              Serviços
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loadingServices
                ? [1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-16 rounded-2xl animate-pulse"
                      style={{ background: "rgba(255,255,255,0.05)" }}
                    />
                  ))
                : services_!.map((service) => {
                    const isHovered = hoveredService === service.id;
                    return (
                      <div
                        key={service.id}
                        className="rounded-2xl p-4 flex items-center justify-between transition-all duration-200 cursor-default"
                        style={{
                          background: isHovered ? `${primaryColor}0d` : "rgba(255,255,255,0.04)",
                          border: `1.5px solid ${isHovered ? primaryColor + "40" : "rgba(255,255,255,0.07)"}`,
                        }}
                        onMouseEnter={() => setHoveredService(service.id)}
                        onMouseLeave={() => setHoveredService(null)}
                      >
                        <div>
                          <p className="font-semibold text-white text-sm">{service.name}</p>
                          {service.description && (
                            <p className="text-xs text-white/35 mt-0.5">{service.description}</p>
                          )}
                          <div className="flex items-center gap-1 mt-1.5 text-white/35 text-xs">
                            <Clock className="h-3 w-3" />
                            <span>{service.durationMinutes} min</span>
                          </div>
                        </div>
                        <span
                          className="text-sm font-bold px-3 py-1.5 rounded-full shrink-0 ml-3"
                          style={{
                            backgroundColor: isHovered ? `${primaryColor}20` : "rgba(255,255,255,0.08)",
                            color: isHovered ? primaryColor : "rgba(255,255,255,0.65)",
                          }}
                        >
                          R$ {(service.priceInCents / 100).toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    );
                  })}
            </div>
          </section>
        )}

        {/* ── CTA Final ───────────────────────────────────────────────────── */}
        <section className="text-center py-8 space-y-4">
          <p
            className="text-2xl font-bold text-white/80"
            style={{ fontFamily: "'Bodoni Moda', serif" }}
          >
            Pronto para agendar?
          </p>
          <button
            onClick={() => navigate(`/b/${slug}/agendar`)}
            className="px-8 py-4 rounded-2xl font-bold text-base inline-flex items-center gap-2.5 transition-all duration-300 cursor-pointer"
            style={{
              backgroundColor: primaryColor,
              color: secondaryColor,
              boxShadow: `0 4px 40px ${primaryColor}35`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = `0 6px 50px ${primaryColor}48`;
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = `0 4px 40px ${primaryColor}35`;
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            Agendar Agora
            <ChevronRight className="h-5 w-5" />
          </button>
        </section>
      </main>
    </div>
  );
}
