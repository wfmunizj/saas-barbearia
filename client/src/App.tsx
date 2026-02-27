import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

// Dashboard (dono/barbeiro)
import Home from "./pages/Home";
import Clients from "./pages/Clients";
import Barbers from "./pages/Barbers";
import Services from "./pages/Services";
import Appointments from "./pages/Appointments";
import Payments from "./pages/Payments";
import Reports from "./pages/Reports";
import Marketing from "./pages/Marketing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Plans from "./pages/Plans";
import TeamAccess from "./pages/TeamAccess";

// Portal do cliente
import BarbershopPage from "./pages/portal/BarbershopPage";
import BookingPage from "./pages/portal/BookingPage";
import ClientAccountPage from "./pages/portal/ClientAccountPage";
import { ClientLoginPage, ClientRegisterPage } from "./pages/portal/ClientAuthPages";
import SubscribePage from "./pages/portal/Subscribepage";

function Router() {
  return (
    <Switch>
      {/* ─── Dashboard (dono) ─────────────────────────────────── */}
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/clients" component={Clients} />
      <Route path="/barbers" component={Barbers} />
      <Route path="/plans" component={Plans} />
      <Route path="/services" component={Services} />
      <Route path="/appointments" component={Appointments} />
      <Route path="/payments" component={Payments} />
      <Route path="/reports" component={Reports} />
      <Route path="/marketing" component={Marketing} />
      <Route path="/team-access" component={TeamAccess} />
      {/* ─── Portal público da barbearia ──────────────────────── */}
      <Route path="/b/:slug" component={BarbershopPage} />
      <Route path="/b/:slug/agendar" component={BookingPage} />
      <Route path="/b/:slug/minha-conta" component={ClientAccountPage} />
      <Route path="/b/:slug/assinar/:planId" component={SubscribePage} />
      <Route path="/b/:slug/login" component={ClientLoginPage} />
      <Route path="/b/:slug/cadastro" component={ClientRegisterPage} />

      {/* ─── 404 ──────────────────────────────────────────────── */}
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
