import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import BarberSummaryContent from "./BarberSummaryContent";

export default function MyBarberSummary() {
  const { user, loading } = useAuth();
  const [, navigate] = useLocation();

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  const barberId = (user as any)?.barberId;

  if (!barberId) {
    return (
      <DashboardLayout>
        <div className="text-center py-16 text-muted-foreground">
          <p>Perfil de barbeiro não vinculado a esta conta.</p>
          <p className="text-xs mt-2">Peça ao dono da barbearia para vincular seu usuário ao cadastro de barbeiro.</p>
        </div>
      </DashboardLayout>
    );
  }

  return <BarberSummaryContent barberId={barberId} backPath="/" />;
}
