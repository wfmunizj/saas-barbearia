import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { Scissors, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

// ─── Shared dark portal layout ────────────────────────────────────────────────

function PortalWrapper({
  primaryColor,
  secondaryColor,
  barbershop,
  slug,
  children,
}: {
  primaryColor: string;
  secondaryColor: string;
  barbershop?: { name?: string | null; logoUrl?: string | null } | null;
  slug: string;
  children: React.ReactNode;
}) {
  const [, navigate] = useLocation();

  return (
    <div
      className="min-h-dvh relative flex overflow-hidden"
      style={{ backgroundColor: "#0a0a0a", fontFamily: "'Jost', sans-serif" }}
    >
      {/* Top glow orb */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: "700px",
          height: "500px",
          background: `radial-gradient(ellipse at 50% 0%, ${primaryColor}28 0%, transparent 65%)`,
          filter: "blur(30px)",
        }}
      />
      {/* Bottom-right glow */}
      <div
        className="absolute bottom-0 right-0 pointer-events-none"
        style={{
          width: "400px",
          height: "400px",
          background: `radial-gradient(ellipse at 100% 100%, ${primaryColor}12 0%, transparent 65%)`,
          filter: "blur(50px)",
        }}
      />

      {/* ── Desktop: left branding panel ───────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-[46%] flex-col justify-between px-16 py-14 relative z-10">
        {/* Back button */}
        <button
          onClick={() => navigate(`/b/${slug}`)}
          className="flex items-center gap-2 text-white/35 hover:text-white/70 transition-colors duration-200 text-sm w-fit cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar para a barbearia
        </button>

        {/* Brand block */}
        <div className="space-y-7 portal-animate-in">
          {/* Logo */}
          <div
            className="h-[72px] w-[72px] rounded-[22px] flex items-center justify-center"
            style={{
              backgroundColor: primaryColor,
              boxShadow: `0 0 80px ${primaryColor}38, 0 8px 32px ${primaryColor}20`,
            }}
          >
            {barbershop?.logoUrl ? (
              <img src={barbershop.logoUrl} className="h-11 w-11 object-contain" alt="" />
            ) : (
              <Scissors className="h-9 w-9" style={{ color: secondaryColor }} />
            )}
          </div>

          {/* Name */}
          {barbershop?.name && (
            <h1
              className="text-5xl xl:text-6xl font-bold text-white leading-tight"
              style={{ fontFamily: "'Bodoni Moda', serif" }}
            >
              {barbershop.name}
            </h1>
          )}

          {/* Tagline */}
          <p className="text-lg text-white/38 leading-relaxed max-w-xs">
            Seu estilo, do seu jeito.
            <br />
            Agende online em segundos.
          </p>

          {/* Divider with dot */}
          <div className="flex items-center gap-3 pt-2">
            <div className="h-px flex-1" style={{ backgroundColor: `${primaryColor}30` }} />
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `${primaryColor}80` }} />
            <div className="h-px flex-1" style={{ backgroundColor: `${primaryColor}30` }} />
          </div>

          {/* Feature pills */}
          <div className="flex gap-3 flex-wrap">
            {["Online 24h", "Sem filas", "Rápido e fácil"].map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: `${primaryColor}14`,
                  border: `1px solid ${primaryColor}25`,
                  color: `${primaryColor}cc`,
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        <div /> {/* spacer */}
      </div>

      {/* ── Form panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-5 py-12 relative z-10">
        {/* Mobile back button */}
        <button
          onClick={() => navigate(`/b/${slug}`)}
          className="lg:hidden absolute top-5 left-4 flex items-center gap-1.5 text-white/35 hover:text-white/70 transition-colors duration-200 text-sm cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="w-full max-w-[360px]">
          {/* Mobile logo + name */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8 portal-animate-in">
            <div
              className="h-[60px] w-[60px] rounded-[18px] flex items-center justify-center"
              style={{
                backgroundColor: primaryColor,
                boxShadow: `0 0 50px ${primaryColor}38`,
              }}
            >
              {barbershop?.logoUrl ? (
                <img src={barbershop.logoUrl} className="h-9 w-9 object-contain" alt="" />
              ) : (
                <Scissors className="h-7 w-7" style={{ color: secondaryColor }} />
              )}
            </div>
            {barbershop?.name && (
              <span
                className="text-lg font-bold text-white text-center"
                style={{ fontFamily: "'Bodoni Moda', serif" }}
              >
                {barbershop.name}
              </span>
            )}
          </div>

          {/* The form card */}
          <div className="portal-animate-in-delay">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Reusable dark input ──────────────────────────────────────────────────────

function DarkInput({
  type = "text",
  id,
  placeholder,
  value,
  onChange,
  required,
  minLength,
  autoComplete,
  primaryColor,
  suffix,
}: {
  type?: string;
  id?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  primaryColor: string;
  suffix?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="portal-dark-input w-full px-4 py-3.5 rounded-xl text-white text-sm transition-all duration-200"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: `1.5px solid ${focused ? primaryColor : "rgba(255,255,255,0.1)"}`,
          boxShadow: focused ? `0 0 20px ${primaryColor}18` : "none",
          fontFamily: "'Jost', sans-serif",
          paddingRight: suffix ? "48px" : undefined,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {suffix && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">{suffix}</div>
      )}
    </div>
  );
}

// ─── Login do Cliente ─────────────────────────────────────────────────────────

export function ClientLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const redirect = new URLSearchParams(search).get("redirect") ?? "";
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });

  const { data: barbershop } = trpc.client.getBarbershop.useQuery({ slug });
  const primaryColor = barbershop?.primaryColor ?? "#C9A84C";
  const secondaryColor = barbershop?.secondaryColor ?? "#000000";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch(`/api/client/${slug}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao entrar");
        return;
      }
      toast.success(`Bem-vindo, ${data.user.name}!`);
      window.location.href = redirect ? `/b/${slug}/${redirect}` : `/b/${slug}`;
    } catch (err) {
      console.error("[Login] Network error:", err);
      toast.error("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PortalWrapper
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      barbershop={barbershop}
      slug={slug!}
    >
      {/* Glass card */}
      <div
        className="rounded-2xl p-7 space-y-6"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div>
          <h2
            className="text-2xl font-bold text-white mb-1"
            style={{ fontFamily: "'Bodoni Moda', serif" }}
          >
            Bem-vindo de volta
          </h2>
          <p className="text-sm text-white/38">Entre com seus dados para acessar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Email
            </label>
            <DarkInput
              type="email"
              id="login-email"
              placeholder="seu@email.com"
              value={formData.email}
              onChange={(v) => setFormData({ ...formData, email: v })}
              required
              autoComplete="email"
              primaryColor={primaryColor}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Senha
            </label>
            <DarkInput
              type={showPassword ? "text" : "password"}
              id="login-password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(v) => setFormData({ ...formData, password: v })}
              required
              autoComplete="current-password"
              primaryColor={primaryColor}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/30 hover:text-white/70 transition-colors cursor-pointer"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 mt-1"
            style={{
              backgroundColor: primaryColor,
              color: secondaryColor,
              fontFamily: "'Jost', sans-serif",
              boxShadow: `0 4px 30px ${primaryColor}30`,
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-white/35 mt-5">
        Não tem conta?{" "}
        <button
          onClick={() => navigate(`/b/${slug}/cadastro`)}
          className="font-semibold hover:opacity-80 transition-opacity cursor-pointer"
          style={{ color: primaryColor }}
        >
          Criar conta
        </button>
      </p>
    </PortalWrapper>
  );
}

// ─── Cadastro do Cliente ──────────────────────────────────────────────────────

export function ClientRegisterPage() {
  const { slug } = useParams<{ slug: string }>();
  const search = useSearch();
  const planId = new URLSearchParams(search).get("planId");
  const redirect = new URLSearchParams(search).get("redirect") ?? "";
  const [, navigate] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });

  const { data: barbershop } = trpc.client.getBarbershop.useQuery({ slug });
  const primaryColor = barbershop?.primaryColor ?? "#C9A84C";
  const secondaryColor = barbershop?.secondaryColor ?? "#000000";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      toast.error("As senhas não coincidem");
      return;
    }
    if (formData.password.length < 6) {
      toast.error("Senha deve ter pelo menos 6 caracteres");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/client/${slug}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Erro ao criar conta");
        return;
      }
      toast.success("Conta criada com sucesso!");
      if (planId) {
        window.location.href = `/b/${slug}/assinar/${planId}`;
      } else {
        window.location.href = redirect ? `/b/${slug}/${redirect}` : `/b/${slug}`;
      }
    } catch (err) {
      console.error("[Register] Network error:", err);
      toast.error("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PortalWrapper
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      barbershop={barbershop}
      slug={slug!}
    >
      <div
        className="rounded-2xl p-7 space-y-5"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <div>
          <h2
            className="text-2xl font-bold text-white mb-1"
            style={{ fontFamily: "'Bodoni Moda', serif" }}
          >
            Criar Conta
          </h2>
          <p className="text-sm text-white/38">Cadastre-se para começar a agendar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Nome completo *
            </label>
            <DarkInput
              id="reg-name"
              placeholder="João Silva"
              value={formData.name}
              onChange={(v) => setFormData({ ...formData, name: v })}
              required
              autoComplete="name"
              primaryColor={primaryColor}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Email *
            </label>
            <DarkInput
              type="email"
              id="reg-email"
              placeholder="seu@email.com"
              value={formData.email}
              onChange={(v) => setFormData({ ...formData, email: v })}
              required
              autoComplete="email"
              primaryColor={primaryColor}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Telefone / WhatsApp
            </label>
            <DarkInput
              type="tel"
              id="reg-phone"
              placeholder="(11) 99999-9999"
              value={formData.phone}
              onChange={(v) => setFormData({ ...formData, phone: v })}
              autoComplete="tel"
              primaryColor={primaryColor}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Senha *
            </label>
            <DarkInput
              type={showPassword ? "text" : "password"}
              id="reg-password"
              placeholder="Mínimo 6 caracteres"
              value={formData.password}
              onChange={(v) => setFormData({ ...formData, password: v })}
              required
              minLength={6}
              autoComplete="new-password"
              primaryColor={primaryColor}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-white/30 hover:text-white/70 transition-colors cursor-pointer"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-white/45 uppercase tracking-widest block">
              Confirmar Senha *
            </label>
            <DarkInput
              type={showPassword ? "text" : "password"}
              id="reg-confirm-password"
              placeholder="Repita a senha"
              value={formData.confirmPassword}
              onChange={(v) => setFormData({ ...formData, confirmPassword: v })}
              required
              autoComplete="new-password"
              primaryColor={primaryColor}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-55 mt-1"
            style={{
              backgroundColor: primaryColor,
              color: secondaryColor,
              fontFamily: "'Jost', sans-serif",
              boxShadow: `0 4px 30px ${primaryColor}30`,
            }}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando conta...
              </>
            ) : (
              "Criar Conta"
            )}
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-white/35 mt-5">
        Já tem conta?{" "}
        <button
          onClick={() => navigate(`/b/${slug}/login`)}
          className="font-semibold hover:opacity-80 transition-opacity cursor-pointer"
          style={{ color: primaryColor }}
        >
          Entrar
        </button>
      </p>
    </PortalWrapper>
  );
}
