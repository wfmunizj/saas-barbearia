import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scissors, Clock, Star, ChevronRight, User, LogIn, Infinity, Phone } from "lucide-react";

export default function BarbershopPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const { data: barbershop, isLoading: loadingShop } = trpc.client.getBarbershop.useQuery({ slug });
  const { data: plans, isLoading: loadingPlans } = trpc.client.getPlans.useQuery({ slug });
  const { data: barbers_, isLoading: loadingBarbers } = trpc.client.getBarbers.useQuery({ slug });
  const { data: services_, isLoading: loadingServices } = trpc.client.getServices.useQuery({ slug });
  const { data: me } = trpc.client.me.useQuery({ slug });

  if (loadingShop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="space-y-3 w-full max-w-4xl px-4">
          <div className="h-16 bg-muted animate-pulse rounded" />
          <div className="h-40 bg-muted animate-pulse rounded-xl" />
        </div>
      </div>
    );
  }

  if (!barbershop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Barbearia não encontrada</h1>
          <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
        </div>
      </div>
    );
  }

  const primaryColor = barbershop.primaryColor ?? "#000000";
  const secondaryColor = barbershop.secondaryColor ?? "#FFFFFF";

  return (
    <div className="min-h-screen bg-background" style={{
      "--portal-primary": primaryColor,
      "--portal-secondary": secondaryColor,
    } as React.CSSProperties}>
      {/* Header */}
      <header className="sticky top-0 z-40 shadow-sm" style={{ backgroundColor: primaryColor }}>
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {barbershop.logoUrl ? (
              <img src={barbershop.logoUrl} className="h-8 w-8 rounded-lg object-contain" alt={barbershop.name} />
            ) : (
              <div className="rounded-xl p-2" style={{ backgroundColor: `${secondaryColor}22` }}>
                <Scissors className="h-5 w-5" style={{ color: secondaryColor }} />
              </div>
            )}
            <span className="font-bold text-lg" style={{ color: secondaryColor }}>{barbershop.name}</span>
          </div>

          {me?.user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm hidden sm:block" style={{ color: `${secondaryColor}cc` }}>
                Olá, {me.user.name?.split(" ")[0]}!
              </span>
              <Button variant="outline" size="sm" onClick={() => navigate(`/b/${slug}/minha-conta`)}
                style={{ borderColor: `${secondaryColor}66`, color: secondaryColor, backgroundColor: "transparent" }}
                className="hover:opacity-80">
                <User className="h-4 w-4 mr-2" />
                Minha Conta
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/b/${slug}/login`)}
                style={{ color: secondaryColor }} className="hover:opacity-80">
                <LogIn className="h-4 w-4 mr-2" />
                Entrar
              </Button>
              <Button size="sm" onClick={() => navigate(`/b/${slug}/cadastro`)}
                style={{ backgroundColor: secondaryColor, color: primaryColor }}
                className="hover:opacity-90">
                Cadastrar
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-12">
        {/* Hero */}
        <section className="text-center space-y-4">
          <h1 className="text-4xl font-bold">{barbershop.name}</h1>
          {barbershop.address && (
            <p className="text-muted-foreground">{barbershop.address}</p>
          )}
          {barbershop.phone && (
            <a href={`tel:${barbershop.phone.replace(/\D/g, "")}`}
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
              <Phone className="h-3 w-3" />
              {barbershop.phone}
            </a>
          )}
          <div>
            <Button size="lg" onClick={() => navigate(`/b/${slug}/agendar`)}
              style={{ backgroundColor: primaryColor, color: secondaryColor }}>
              Agendar Agora
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Planos */}
        {(loadingPlans || (plans && plans.length > 0)) && (
          <section className="space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Planos Mensais</h2>
              <p className="text-muted-foreground mt-1">Assine e economize com agendamentos recorrentes</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {loadingPlans
                ? [1, 2, 3].map(i => <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />)
                : plans!.map((plan) => {
                  const isUnlimited = (plan as any).isUnlimited ?? false;
                  return (
                    <Card key={plan.id} className="relative hover:shadow-lg transition-shadow border-2"
                      style={{ borderColor: "transparent" }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = primaryColor)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}>
                      <CardHeader>
                        <CardTitle>{plan.name}</CardTitle>
                        {plan.description && (
                          <CardDescription>{plan.description}</CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <span className="text-3xl font-bold">
                            R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}
                          </span>
                          <span className="text-muted-foreground">/mês</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {isUnlimited ? (
                            <><Infinity className="h-4 w-4 text-blue-500" /><span>Agendamentos ilimitados</span></>
                          ) : (
                            <><Star className="h-4 w-4 text-yellow-500" />
                            <span>{plan.creditsPerMonth} agendamento{plan.creditsPerMonth > 1 ? "s" : ""} por mês</span></>
                          )}
                        </div>
                        <Button
                          className="w-full"
                          style={{ backgroundColor: primaryColor, color: secondaryColor }}
                          onClick={() => {
                            if (!me?.user) {
                              navigate(`/b/${slug}/cadastro?planId=${plan.id}`);
                            } else {
                              navigate(`/b/${slug}/assinar/${plan.id}`);
                            }
                          }}
                        >
                          {me?.subscription ? "Trocar Plano" : "Assinar"}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              }
            </div>
          </section>
        )}

        {/* Barbeiros */}
        {(loadingBarbers || (barbers_ && barbers_.length > 0)) && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-center">Nossa Equipe</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {loadingBarbers
                ? [1, 2, 3].map(i => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)
                : barbers_!.map((barber) => (
                  <Card key={barber.id} className="text-center p-4">
                    <div className="rounded-full h-16 w-16 mx-auto mb-3 flex items-center justify-center text-xl font-bold"
                      style={{ backgroundColor: primaryColor, color: secondaryColor }}>
                      {barber.name.split(" ").slice(0, 2).map((n: string) => n[0].toUpperCase()).join("")}
                    </div>
                    <p className="font-semibold">{barber.name}</p>
                    {barber.specialties && (
                      <p className="text-xs text-muted-foreground mt-1">{barber.specialties}</p>
                    )}
                  </Card>
                ))
              }
            </div>
          </section>
        )}

        {/* Serviços */}
        {(loadingServices || (services_ && services_.length > 0)) && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-center">Serviços</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {loadingServices
                ? [1, 2, 3, 4].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)
                : services_!.map((service) => (
                  <Card key={service.id}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-semibold">{service.name}</p>
                        {service.description && (
                          <p className="text-sm text-muted-foreground">{service.description}</p>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{service.durationMinutes} min</span>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-sm font-bold">
                        R$ {(service.priceInCents / 100).toFixed(2).replace(".", ",")}
                      </Badge>
                    </CardContent>
                  </Card>
                ))
              }
            </div>
          </section>
        )}

        {/* CTA Final */}
        <section className="text-center py-8">
          <Button size="lg" onClick={() => navigate(`/b/${slug}/agendar`)}
            style={{ backgroundColor: primaryColor, color: secondaryColor }}>
            Agendar Agora
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </section>
      </main>
    </div>
  );
}
