import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, DollarSign, Loader2, X, Check } from "lucide-react";

export default function Plans() {
  const utils = trpc.useUtils();
  const { data: plans, isLoading } = trpc.plans.list.useQuery();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<null | typeof plans[0]>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    priceInCents: "",
    creditsPerMonth: "",
  });

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
    setForm({ name: "", description: "", priceInCents: "", creditsPerMonth: "" });
    setShowForm(false);
    setEditing(null);
  }

  function openEdit(plan: typeof plans[0]) {
    setEditing(plan);
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      priceInCents: (plan.priceInCents / 100).toFixed(2),
      creditsPerMonth: plan.creditsPerMonth.toString(),
    });
    setShowForm(true);
  }

  function handleSubmit() {
    const priceInCents = Math.round(parseFloat(form.priceInCents.replace(",", ".")) * 100);
    const creditsPerMonth = parseInt(form.creditsPerMonth);

    if (!form.name || isNaN(priceInCents) || isNaN(creditsPerMonth)) {
      toast.error("Preencha todos os campos corretamente.");
      return;
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, name: form.name, description: form.description || undefined });
    } else {
      createMutation.mutate({ name: form.name, description: form.description || undefined, priceInCents, creditsPerMonth });
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Planos de Assinatura</h1>
            <p className="text-muted-foreground mt-1">
              Crie planos mensais para seus clientes assinarem
            </p>
          </div>
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          )}
        </div>

        {/* Formulário */}
        {showForm && (
          <Card className="border-primary border-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{editing ? "Editar Plano" : "Novo Plano"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Nome do plano *</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Ex: Plano Mensal Básico"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Descrição</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                    placeholder="Descrição opcional"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>
                {!editing && (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Preço mensal (R$) *</label>
                      <input
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                        placeholder="Ex: 89,90"
                        value={form.priceInCents}
                        onChange={e => setForm(f => ({ ...f, priceInCents: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Créditos por mês *</label>
                      <input
                        className="w-full border rounded-lg px-3 py-2 text-sm bg-background"
                        placeholder="Ex: 4"
                        type="number"
                        min={1}
                        value={form.creditsPerMonth}
                        onChange={e => setForm(f => ({ ...f, creditsPerMonth: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">Quantidade de agendamentos incluídos no mês</p>
                    </div>
                  </>
                )}
              </div>
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
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : plans && plans.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map(plan => (
              <Card key={plan.id} className={`relative ${!plan.isActive ? "opacity-50" : "hover:shadow-md transition-shadow"}`}>
                {!plan.isActive && (
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary">Inativo</Badge>
                  </div>
                )}
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {plan.description && (
                    <p className="text-sm text-muted-foreground">{plan.description}</p>
                  )}
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
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span>{plan.creditsPerMonth} agendamento{plan.creditsPerMonth > 1 ? "s" : ""} por mês</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEdit(plan)}
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggleActiveMutation.mutate({ id: plan.id, isActive: !plan.isActive })}
                    >
                      {plan.isActive ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Remover este plano?")) {
                          deleteMutation.mutate({ id: plan.id });
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <Star className="h-12 w-12 mx-auto text-muted-foreground" />
              <p className="text-lg font-semibold">Nenhum plano criado ainda</p>
              <p className="text-sm text-muted-foreground">
                Crie planos mensais para que seus clientes possam assinar e garantir agendamentos recorrentes.
              </p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Plano
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Info box */}
        <Card className="bg-muted/30 border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Como funciona?</p>
            <p>Ao criar um plano, um produto e preço são criados automaticamente no Stripe.</p>
            <p>Quando o cliente assina, ele pode usar os créditos mensais para agendar sem pagar avulso.</p>
            <p>Os créditos renovam automaticamente todo mês via cobrança recorrente no cartão do cliente.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}