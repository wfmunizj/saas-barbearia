import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, DollarSign, Loader2, X, Check, Infinity, Calendar, Scissors } from "lucide-react";

const DAY_OPTIONS = [
  { label: "Dom", value: 0 },
  { label: "Seg", value: 1 },
  { label: "Ter", value: 2 },
  { label: "Qua", value: 3 },
  { label: "Qui", value: 4 },
  { label: "Sex", value: 5 },
  { label: "Sáb", value: 6 },
];

type PlanType = "monthly_limited" | "unlimited" | "single_cut";

interface FormState {
  name: string;
  description: string;
  priceInCents: string;
  creditsPerMonth: string;
  planType: PlanType;
  allowedDaysOfWeek: number[];
  isUnlimited: boolean;
  serviceIds: number[];
}

const defaultForm: FormState = {
  name: "",
  description: "",
  priceInCents: "",
  creditsPerMonth: "4",
  planType: "monthly_limited",
  allowedDaysOfWeek: [],
  isUnlimited: false,
  serviceIds: [],
};

export default function Plans() {
  const utils = trpc.useUtils();
  const { data: plans, isLoading } = trpc.plans.list.useQuery();
  const { data: allServices } = trpc.services.list.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<null | any>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const createMutation = trpc.plans.create.useMutation({
    onSuccess: () => {
      toast.success("Plano criado com sucesso!");
      utils.plans.list.invalidate();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const updateMutation = trpc.plans.update.useMutation({
    onSuccess: () => {
      toast.success("Plano atualizado!");
      utils.plans.list.invalidate();
      resetForm();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.plans.delete.useMutation({
    onSuccess: () => {
      toast.success("Plano removido.");
      utils.plans.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleActiveMutation = trpc.plans.update.useMutation({
    onSuccess: () => utils.plans.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  function resetForm() {
    setForm(defaultForm);
    setShowForm(false);
    setEditing(null);
  }

  function openEdit(plan: any) {
    setEditing(plan);
    const rawDays = plan.allowedDaysOfWeek;
    let days: number[] = [];
    try { days = rawDays ? JSON.parse(rawDays) : []; } catch { days = []; }
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      priceInCents: (plan.priceInCents / 100).toFixed(2),
      creditsPerMonth: plan.creditsPerMonth.toString(),
      planType: (plan.planType as PlanType) ?? "monthly_limited",
      allowedDaysOfWeek: days,
      isUnlimited: plan.isUnlimited ?? false,
      serviceIds: [],
    });
    setShowForm(true);
  }

  function toggleDay(day: number) {
    setForm(f => ({
      ...f,
      allowedDaysOfWeek: f.allowedDaysOfWeek.includes(day)
        ? f.allowedDaysOfWeek.filter(d => d !== day)
        : [...f.allowedDaysOfWeek, day].sort(),
    }));
  }

  function toggleService(serviceId: number) {
    setForm(f => ({
      ...f,
      serviceIds: f.serviceIds.includes(serviceId)
        ? f.serviceIds.filter(id => id !== serviceId)
        : [...f.serviceIds, serviceId],
    }));
  }

  function handlePlanTypeChange(type: PlanType) {
    setForm(f => ({
      ...f,
      planType: type,
      isUnlimited: type === "unlimited",
      creditsPerMonth: type === "unlimited" ? "0" : type === "single_cut" ? "1" : f.creditsPerMonth,
    }));
  }

  function handleSubmit() {
    const priceInCents = Math.round(parseFloat(form.priceInCents.replace(",", ".")) * 100);
    const creditsPerMonth = parseInt(form.creditsPerMonth);

    if (!form.name || isNaN(priceInCents)) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        name: form.name,
        description: form.description || undefined,
        planType: form.planType,
        allowedDaysOfWeek: form.allowedDaysOfWeek.length > 0 ? form.allowedDaysOfWeek : null,
        isUnlimited: form.isUnlimited,
        serviceIds: form.serviceIds.length > 0 ? form.serviceIds : undefined,
      });
    } else {
      createMutation.mutate({
        name: form.name,
        description: form.description || undefined,
        priceInCents,
        creditsPerMonth: isNaN(creditsPerMonth) ? 0 : creditsPerMonth,
        planType: form.planType,
        allowedDaysOfWeek: form.allowedDaysOfWeek.length > 0 ? form.allowedDaysOfWeek : undefined,
        isUnlimited: form.isUnlimited,
        serviceIds: form.serviceIds.length > 0 ? form.serviceIds : undefined,
      });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  const planTypeLabel = (type: string | null) => {
    if (type === "unlimited") return { label: "Ilimitado", color: "bg-blue-100 text-blue-700" };
    if (type === "single_cut") return { label: "Avulso", color: "bg-orange-100 text-orange-700" };
    return { label: "Mensal", color: "bg-green-100 text-green-700" };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Planos de Assinatura</h1>
            <p className="text-muted-foreground mt-1">
              Crie planos mensais, ilimitados ou avulsos para seus clientes
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />Novo Plano
            </Button>
          )}
        </div>

        {/* Formulário */}
        {showForm && (
          <Card className="border-primary border-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{editing ? "Editar Plano" : "Novo Plano"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}><X className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Tipo de Plano */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Tipo de Plano *</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "monthly_limited", label: "Mensal (créditos)", icon: Star },
                    { value: "unlimited", label: "Ilimitado", icon: Infinity },
                    { value: "single_cut", label: "Avulso", icon: Scissors },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button key={value} type="button"
                      onClick={() => handlePlanTypeChange(value)}
                      className={`p-3 rounded-lg border text-sm font-medium text-center transition-all flex flex-col items-center gap-1 ${
                        form.planType === value ? "border-primary bg-primary/5" : "hover:border-muted-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nome e descrição */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nome do plano *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Ex: Plano Mensal Básico"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descrição</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Descrição opcional"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
              </div>

              {/* Preço e Créditos */}
              {!editing && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">Preço mensal (R$) *</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                      placeholder="Ex: 89,90"
                      value={form.priceInCents} onChange={e => setForm(f => ({ ...f, priceInCents: e.target.value }))} />
                  </div>
                  {form.planType === "monthly_limited" && (
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Créditos por mês *</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                        placeholder="Ex: 4" type="number" min={1}
                        value={form.creditsPerMonth}
                        onChange={e => setForm(f => ({ ...f, creditsPerMonth: e.target.value }))} />
                      <p className="text-xs text-muted-foreground">Agendamentos incluídos no mês</p>
                    </div>
                  )}
                </div>
              )}

              {/* Dias Permitidos */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Dias permitidos para agendamento
                  <span className="text-muted-foreground font-normal">(deixe vazio para todos os dias)</span>
                </label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_OPTIONS.map(day => (
                    <button key={day.value} type="button"
                      onClick={() => toggleDay(day.value)}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                        form.allowedDaysOfWeek.includes(day.value)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary"
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
                {form.allowedDaysOfWeek.length > 0 && (
                  <p className="text-xs text-amber-600">
                    Clientes deste plano só poderão agendar nos dias selecionados.
                  </p>
                )}
              </div>

              {/* Serviços incluídos (Bronze/Prata/Ouro) */}
              {allServices && allServices.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <Scissors className="h-4 w-4" /> Serviços incluídos no plano
                    <span className="text-muted-foreground font-normal">(opcional — Bronze/Prata/Ouro)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {allServices.map(svc => (
                      <button key={svc.id} type="button"
                        onClick={() => toggleService(svc.id)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          form.serviceIds.includes(svc.id)
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "hover:border-muted-foreground"
                        }`}
                      >
                        {svc.name} — R${(svc.priceInCents / 100).toFixed(2).replace(".", ",")}
                      </button>
                    ))}
                  </div>
                  {form.serviceIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Serviços fora do plano serão cobrados à parte do cliente.
                    </p>
                  )}
                </div>
              )}

              {editing && (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                  ⚠️ Preço e créditos não podem ser alterados após criação (vinculados ao Stripe). Para alterar, crie um novo plano e desative este.
                </p>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={isPending}>
                  {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {editing ? "Salvar" : "Criar Plano"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lista de planos */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : plans && plans.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(plan => {
              const typeInfo = planTypeLabel(plan.planType);
              let days: number[] = [];
              try { days = plan.allowedDaysOfWeek ? JSON.parse(plan.allowedDaysOfWeek) : []; } catch { days = []; }
              const dayNames = days.map(d => DAY_OPTIONS.find(o => o.value === d)?.label).filter(Boolean).join(", ");

              return (
                <Card key={plan.id} className={`relative ${!plan.isActive ? "opacity-50" : "hover:shadow-md transition-shadow"}`}>
                  {!plan.isActive && (
                    <div className="absolute top-2 right-2"><Badge variant="secondary">Inativo</Badge></div>
                  )}
                  <CardHeader className="pb-2">
                    <div className="flex items-start gap-2">
                      <CardTitle className="text-base flex-1">{plan.name}</CardTitle>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
                    </div>
                    {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <span className="text-2xl font-bold">
                          R$ {(plan.priceInCents / 100).toFixed(2).replace(".", ",")}
                        </span>
                        <span className="text-muted-foreground text-sm">/mês</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {plan.isUnlimited ? (
                          <><Infinity className="h-4 w-4 text-blue-500" /><span>Agendamentos ilimitados</span></>
                        ) : (
                          <><Star className="h-4 w-4 text-yellow-500" /><span>{plan.creditsPerMonth} agendamento{plan.creditsPerMonth !== 1 ? "s" : ""}/mês</span></>
                        )}
                      </div>
                      {dayNames && (
                        <p className="text-xs text-amber-600 flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> Apenas: {dayNames}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(plan)}>
                        <Pencil className="h-3 w-3 mr-1" />Editar
                      </Button>
                      <Button variant="outline" size="sm"
                        onClick={() => toggleActiveMutation.mutate({ id: plan.id, isActive: !plan.isActive })}>
                        {plan.isActive ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive"
                        onClick={() => { if (confirm("Remover este plano?")) deleteMutation.mutate({ id: plan.id }); }}
                        disabled={deleteMutation.isPending}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <Star className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-lg font-semibold">Nenhum plano criado ainda</p>
              <p className="text-sm text-muted-foreground">
                Crie planos mensais, ilimitados ou avulsos para seus clientes.
              </p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />Criar Primeiro Plano
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Tipos de plano disponíveis</p>
            <p><strong>Mensal (créditos):</strong> Cliente tem N agendamentos por mês. Ex: 4 cortes — R$160.</p>
            <p><strong>Ilimitado:</strong> Assinatura sem limite de agendamentos. Ex: R$99,90/mês todos os dias.</p>
            <p><strong>Avulso:</strong> Sem assinatura — cliente paga por corte individual.</p>
            <p className="mt-2"><strong>Dias fixos:</strong> Selecione os dias permitidos (ex: Ter, Qua, Qui) para planos mensais com horário fixo.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
