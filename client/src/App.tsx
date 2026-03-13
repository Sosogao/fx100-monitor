import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { MonitoringProvider } from "./contexts/MonitoringContext";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import MonitoringEnhanced from "./pages/MonitoringEnhanced";
import AlertsEnhanced from "./pages/AlertsEnhanced";
import ParametersEnhanced from "./pages/ParametersEnhanced";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/monitoring" component={MonitoringEnhanced} />
        <Route path="/alerts" component={AlertsEnhanced} />
        <Route path="/parameters" component={ParametersEnhanced} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <MonitoringProvider>
            <Toaster />
            <Router />
          </MonitoringProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
