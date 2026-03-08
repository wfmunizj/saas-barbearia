import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { APP_LOGO, APP_TITLE } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard,
  LogOut,
  PanelLeft,
  Users,
  Scissors,
  Calendar,
  CreditCard,
  BarChart3,
  MessageSquare,
  Tag,
  Star,
  Users2,
  Settings,
  BriefcaseBusiness,
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";
import { ChevronDown, Plus } from "lucide-react";

// Itens com campo `roles`: quais roles podem ver. undefined = todos.
const allMenuItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/", roles: undefined },
  {
    icon: Calendar,
    label: "Agendamentos",
    path: "/appointments",
    roles: undefined,
  },
  { icon: BarChart3, label: "Meu Resumo", path: "/meu-resumo", roles: ["barber"] },
  { icon: Users, label: "Clientes", path: "/clients", roles: ["owner", "admin"] },
  { icon: Scissors, label: "Barbeiros", path: "/barbers", roles: ["owner", "admin"] },
  { icon: Tag, label: "Serviços", path: "/services", roles: ["owner", "admin"] },
  { path: "/subscription", label: "Minha Assinatura", icon: CreditCard, roles: ["owner", "admin"] },
  {
    icon: CreditCard,
    label: "Pagamentos",
    path: "/payments",
    roles: ["owner", "admin"],
  },
  { icon: BarChart3, label: "Relatórios", path: "/reports", roles: ["owner", "admin"] },
  {
    icon: MessageSquare,
    label: "Marketing",
    path: "/marketing",
    roles: ["owner", "admin"],
  },
  { icon: Star, label: "Planos", path: "/plans", roles: ["owner", "admin"] },
  {
    icon: Users2,
    label: "Acesso da Equipe",
    path: "/team-access",
    roles: ["owner", "admin"],
  },
    {
    icon: Settings,
    label: "Nova Barbearia",
    path: "/nova-barbearia",
    roles: ["owner"],
  },
  {
    icon: Settings,
    label: "Configurações",
    path: "/configuracoes",
    roles: ["owner", "admin"],
  },

];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-6">
            <div className="relative">
              <img
                src={APP_LOGO}
                alt={APP_TITLE}
                className="h-20 w-20 rounded-xl object-cover shadow"
              />
            </div>
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">{APP_TITLE}</h1>
              <p className="text-sm text-muted-foreground">
                Faça login para continuar
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <Button
              onClick={() => navigate("/login")}
              size="lg"
              className="w-full shadow-lg hover:shadow-xl transition-all"
            >
              Entrar
            </Button>
            <Button
              onClick={() => navigate("/register")}
              size="lg"
              variant="outline"
              className="w-full"
            >
              Criar barbearia grátis
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Filtra o menu baseado no role do usuário
  const role = (user as any)?.role ?? "barber";
  const menuItems = allMenuItems.filter(
    item => !item.roles || item.roles.includes(role)
  );

  // Multi-barbearia: lista barbearias do owner
  const { data: myBarbershops } = trpc.barbershop.myList.useQuery(undefined, {
    enabled: role === "owner",
  });
  const switchMutation = trpc.barbershop.switch.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const activeBarbershopId = (user as any)?.barbershopId;

  const activeMenuItem = menuItems.find(item => item.path === location);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = Math.min(
        Math.max(e.clientX - sidebarLeft, MIN_WIDTH),
        MAX_WIDTH
      );
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => setIsResizing(false);

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon">
          <SidebarHeader className="p-3 border-b">
            <div className="flex items-center gap-3 min-w-0 h-10">
              {isCollapsed ? (
                <div className="relative h-8 w-8 shrink-0 group">
                  <img
                    src={APP_LOGO}
                    className="h-8 w-8 rounded-md object-cover ring-1 ring-border"
                    alt="Logo"
                  />
                  <button
                    onClick={toggleSidebar}
                    className="absolute inset-0 flex items-center justify-center bg-accent rounded-md ring-1 ring-border opacity-0 group-hover:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <PanelLeft className="h-4 w-4 text-foreground" />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={APP_LOGO}
                      className="h-8 w-8 rounded-md object-cover ring-1 ring-border shrink-0"
                      alt="Logo"
                    />
                    <span className="font-semibold tracking-tight truncate">
                      {(user as any)?.barbershop?.name || APP_TITLE}
                    </span>
                  </div>
                  <button
                    onClick={toggleSidebar}
                    className="ml-auto h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                  >
                    <PanelLeft className="h-4 w-4 text-muted-foreground" />
                  </button>
                </>
              )}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-10 transition-all font-normal"
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* BarbershopSwitcher — só para owners */}
            {role === "owner" && myBarbershops && myBarbershops.length > 0 && !isCollapsed && (
              <div className="px-2 py-2 border-t mt-auto">
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 mb-1">Barbearia ativa</p>
                <DropdownMenu open={switcherOpen} onOpenChange={setSwitcherOpen}>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center gap-2 w-full px-2 py-2 rounded-lg hover:bg-accent text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex-1 text-left truncate font-medium">
                        {myBarbershops.find(b => b.id === activeBarbershopId)?.name ?? "Minha Barbearia"}
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                    {myBarbershops.map(b => (
                      <DropdownMenuItem
                        key={b.id}
                        onClick={() => {
                          if (b.id !== activeBarbershopId) {
                            switchMutation.mutate({ barbershopId: b.id });
                          }
                        }}
                        className={`cursor-pointer ${b.id === activeBarbershopId ? "font-semibold text-primary" : ""}`}
                      >
                        {b.name}
                        {b.id === activeBarbershopId && (
                          <span className="ml-auto text-[10px] text-primary">ativa</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem
                      onClick={() => setLocation("/nova-barbearia")}
                      className="cursor-pointer text-primary font-medium"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Nova Barbearia
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </SidebarContent>

          <SidebarFooter className="p-3">
            {/* Badge de role */}
            {!isCollapsed && (
              <div className="px-1 pb-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    role === "owner"
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {role === "owner" ? "Proprietário" : "Barbeiro"}
                </span>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sair</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${
            isCollapsed ? "hidden" : ""
          }`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-2">
                <span className="tracking-tight text-foreground">
                  {activeMenuItem?.label ??
                    (user as any)?.barbershop?.name ??
                    APP_TITLE}
                </span>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
