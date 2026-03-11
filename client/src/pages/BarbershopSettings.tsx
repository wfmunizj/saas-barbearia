import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Settings, Palette, Save, CreditCard, CheckCircle, XCircle, ExternalLink, Copy } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const THEMES = [
  {
    label: "Branco",
    primary: "#FFFFFF",
    secondary: "#111111",
    preview: { bg: "#FFFFFF", text: "#111111", border: "#E5E7EB" },
  },
  {
    label: "Azul",
    primary: "#1E3A5F",
    secondary: "#4A90D9",
    preview: { bg: "#1E3A5F", text: "#FFFFFF", border: "#1E3A5F" },
  },
  {
    label: "Vermelho 307",
    primary: "#C0392B",
    secondary: "#FFFFFF",
    preview: { bg: "#C0392B", text: "#FFFFFF", border: "#C0392B" },
  },
];

export default function BarbershopSettings() {
  const { data: barbershop, refetch } = trpc.barbershop.get.useQuery();

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    logoUrl: "",
    primaryColor: "#000000",
    secondaryColor: "#FFFFFF",
  });

  useEffect(() => {
    if (barbershop) {
      setForm({
        name: barbershop.name ?? "",
        email: barbershop.email ?? "",
        phone: barbershop.phone ?? "",
        address: barbershop.address ?? "",
        logoUrl: barbershop.logoUrl ?? "",
        primaryColor: barbershop.primaryColor ?? "#000000",
        secondaryColor: barbershop.secondaryColor ?? "#FFFFFF",
      });
    }
  }, [barbershop]);

  const updateMutation = trpc.barbershop.update.useMutation({
    onSuccess: () => {
      toast.success("Configurações salvas com sucesso!");
      refetch();
    },
    onError: (err) => toast.error("Erro ao salvar: " + err.message),
  });

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate({
      name: form.name || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      address: form.address || undefined,
      logoUrl: form.logoUrl || undefined,
      primaryColor: form.primaryColor,
      secondaryColor: form.secondaryColor,
    });
  }

  function applyTheme(theme: (typeof THEMES)[number]) {
    setForm((f) => ({ ...f, primaryColor: theme.primary, secondaryColor: theme.secondary }));
  }

  const activeTheme = THEMES.find(
    (t) => t.primary === form.primaryColor && t.secondary === form.secondaryColor
  );

  return (
    <DashboardLayout>
      <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Settings className="h-7 w-7" /> Configurações
            </h1>
            <p className="text-muted-foreground mt-1">Informações da barbearia e tema do portal</p>
          </div>
          <Button type="submit" disabled={updateMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>

        {/* Dados gerais */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dados da Barbearia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input id="name" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logoUrl">URL do Logo</Label>
              <Input id="logoUrl" placeholder="https://..." value={form.logoUrl}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
            </div>
          </CardContent>
        </Card>

        {/* Tema do Portal */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Palette className="h-4 w-4" /> Tema do Portal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escolha o tema visual que seus clientes verão no portal de agendamento.
            </p>

            {/* Presets */}
            <div className="grid grid-cols-3 gap-3">
              {THEMES.map((theme) => {
                const isActive = activeTheme?.label === theme.label;
                return (
                  <button
                    key={theme.label}
                    type="button"
                    onClick={() => applyTheme(theme)}
                    className={`rounded-xl border-2 p-3 text-center transition-all cursor-pointer ${
                      isActive ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    {/* Mini preview */}
                    <div
                      className="rounded-lg mb-2 h-14 flex flex-col items-center justify-center gap-1"
                      style={{ backgroundColor: theme.preview.bg, border: `1px solid ${theme.preview.border}` }}
                    >
                      <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: theme.preview.text, opacity: 0.8 }} />
                      <div className="w-12 h-2.5 rounded"
                        style={{ backgroundColor: theme.secondary === "#FFFFFF" ? theme.preview.text : theme.secondary, opacity: 0.6 }} />
                    </div>
                    <p className="text-xs font-medium">{theme.label}</p>
                  </button>
                );
              })}
            </div>

            {/* Cores customizadas */}
            <div className="border-t pt-4 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Cor principal</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" id="primaryColor" value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer" />
                  <Input value={form.primaryColor}
                    onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                    placeholder="#000000" className="font-mono" maxLength={7} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Cor secundária</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" id="secondaryColor" value={form.secondaryColor}
                    onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    className="w-10 h-10 rounded border cursor-pointer" />
                  <Input value={form.secondaryColor}
                    onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })}
                    placeholder="#FFFFFF" className="font-mono" maxLength={7} />
                </div>
              </div>
            </div>

            {/* Live preview */}
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground mb-2">Preview do portal</p>
              <div className="rounded-xl overflow-hidden border">
                <div className="px-4 py-3 flex items-center gap-2"
                  style={{ backgroundColor: form.primaryColor }}>
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: form.secondaryColor }}>
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: form.primaryColor }} />
                  </div>
                  <span className="font-bold text-sm" style={{ color: form.secondaryColor }}>
                    {form.name || barbershop?.name || "Nome da Barbearia"}
                  </span>
                  <div className="ml-auto rounded px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: form.secondaryColor, color: form.primaryColor }}>
                    Agendar
                  </div>
                </div>
                <div className="bg-background px-4 py-3 text-xs text-muted-foreground">
                  Portal de agendamento
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* ── Stripe: Pagamentos ──────────────────────────────────────────────── */}
      <div className="max-w-2xl space-y-4 mt-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Pagamentos (Stripe)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Status da conta Connect */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Stripe Connect</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Necessário para receber pagamentos dos clientes diretamente.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {barbershop?.stripeConnectStatus === "active" ? (
                  <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full font-medium">
                    <CheckCircle className="h-3.5 w-3.5" /> Ativo
                  </span>
                ) : barbershop?.stripeConnectStatus === "pending" ? (
                  <span className="flex items-center gap-1 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 px-2.5 py-1 rounded-full font-medium">
                    <XCircle className="h-3.5 w-3.5" /> Pendente
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">
                    <XCircle className="h-3.5 w-3.5" /> Não configurado
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open("/api/stripe/connect/onboarding", "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  {barbershop?.stripeConnectStatus === "active" ? "Gerenciar" : "Configurar"}
                </Button>
              </div>
            </div>

            {/* Checklist de produção */}
            <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Checklist para produção</p>

              <div className="space-y-2.5 text-sm">
                <div className="flex gap-2">
                  <span className="shrink-0 mt-0.5">
                    {barbershop?.stripeConnectStatus === "active"
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <div>
                    <p className="font-medium">Variáveis de ambiente no Railway</p>
                    <code className="text-xs text-muted-foreground block mt-0.5">
                      STRIPE_SECRET_KEY=sk_live_...<br />
                      STRIPE_WEBHOOK_SECRET=whsec_...
                    </code>
                  </div>
                </div>

                <div className="flex gap-2">
                  <XCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Webhook no Stripe Dashboard</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Adicione o endpoint abaixo em{" "}
                      <a
                        href="https://dashboard.stripe.com/webhooks"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Developers → Webhooks
                      </a>
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="text-xs bg-background border rounded px-2 py-1 flex-1 truncate">
                        {typeof window !== "undefined" ? window.location.origin : "https://SEU-DOMINIO"}/api/stripe/webhook
                      </code>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => {
                          const url = `${window.location.origin}/api/stripe/webhook`;
                          navigator.clipboard.writeText(url);
                          toast.success("URL copiada!");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      Eventos necessários: <code className="text-xs">checkout.session.completed</code>,{" "}
                      <code className="text-xs">customer.subscription.*</code>,{" "}
                      <code className="text-xs">invoice.payment_*</code>,{" "}
                      <code className="text-xs">account.updated</code>
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <span className="shrink-0 mt-0.5">
                    {barbershop?.stripeConnectStatus === "active"
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-muted-foreground" />}
                  </span>
                  <div>
                    <p className="font-medium">Onboarding Stripe Connect concluído</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Complete o cadastro KYC no Stripe para ativar recebimentos.
                      Status atual:{" "}
                      <span className="font-medium">
                        {barbershop?.stripeConnectStatus === "active" ? "✅ Ativo" :
                         barbershop?.stripeConnectStatus === "pending" ? "⏳ Aguardando aprovação" :
                         "❌ Não iniciado"}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
