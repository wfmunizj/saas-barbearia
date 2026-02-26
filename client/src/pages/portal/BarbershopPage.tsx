import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Scissors, Clock, Star, ChevronRight, User, LogIn } from "lucide-react";

export default function BarbershopPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();

  const { data: barbershop, isLoading: loadingShop } = trpc.client.getBarbershop.useQuery({ slug });
  const { data: plans } = trpc.client.getPlans.useQuery({ slug });
  const { data: barbers_ } = trpc.client.getBarbers.useQuery({ slug });
  const { data: services_ } = trpc.client.getServices.useQuery({ slug });
  const { data: me } = trpc.client.me.useQuery({ slug });

  if (loadingShop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background/95 backdrop-blur z-40">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-xl p-2">
              <Scissors className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">{barbershop.name}</span>
          </div>

          {me?.user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:block">
                Olá, {me.user.name?.split(" ")[0]}!
              </span>
              <Button variant="outline" size="sm" onClick={() => navigate(`/b/${slug}/minha-conta`)}>
                <User className="h-4 w-4 mr-2" />
                Minha Conta
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate(`/b/${slug}/login`)}>
                <LogIn className="h-4 w-4 mr-2" />
                Entrar
              </Button>
              <Button size="sm" onClick={() => navigate(`/b/${slug}/cadastro`)}>
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
          <Button size="lg" onClick={() => navigate(`/b/${slug}/agendar`)}>
            Agendar Agora
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </section>

        {/* Planos */}
        {plans && plans.length > 0 && (
          <section className="space-y-4">
            <div className="text-center">
              <h2 className="text-2xl font-bold">Planos Mensais</h2>
              <p className="text-muted-foreground mt-1">Assine e economize com agendamentos recorrentes</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <Card key={plan.id} className="relative hover:shadow-lg transition-shadow border-2 hover:border-primary">
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
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span>{plan.creditsPerMonth} agendamento{plan.creditsPerMonth > 1 ? "s" : ""} por mês</span>
                    </div>
                    <Button
                      className="w-full"
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
              ))}
            </div>
          </section>
        )}

        {/* Barbeiros */}
        {barbers_ && barbers_.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-center">Nossa Equipe</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {barbers_.map((barber) => (
                <Card key={barber.id} className="text-center p-4">
                  <div className="bg-muted rounded-full h-16 w-16 mx-auto mb-3 flex items-center justify-center">
                    <User className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="font-semibold">{barber.name}</p>
                  {barber.specialties && (
                    <p className="text-xs text-muted-foreground mt-1">{barber.specialties}</p>
                  )}
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Serviços */}
        {services_ && services_.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-2xl font-bold text-center">Serviços</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {services_.map((service) => (
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
              ))}
            </div>
          </section>
        )}

        {/* CTA Final */}
        <section className="text-center py-8">
          <Button size="lg" onClick={() => navigate(`/b/${slug}/agendar`)}>
            Agendar Agora
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </section>
      </main>
    </div>
  );
}
