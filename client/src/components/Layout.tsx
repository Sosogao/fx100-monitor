import { Link, useLocation } from "wouter";
import { LayoutDashboard, AlertTriangle, Settings, Activity, ShieldAlert, SlidersHorizontal, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMonitoring } from "@/contexts/MonitoringContext";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { snapshot } = useMonitoring();

  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Monitoring", path: "/monitoring", icon: Activity },
    { name: "Alerts", path: "/alerts", icon: AlertTriangle },
    { name: "Risk Parameters", path: "/parameters", icon: Settings },
    { name: "Protocol Ops", path: "/protocol-ops", icon: SlidersHorizontal },
    { name: "Distribution Ops", path: "/distribution-ops", icon: Network },
    { name: "Distribution Registry", path: "/distribution-registry", icon: Network },
  ];

  const criticalCount = snapshot?.alerts.filter((alert) => alert.level === "l3").length ?? 0;
  const activeCount = snapshot?.alerts.filter((alert) => alert.status !== "resolved").length ?? 0;

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col md:flex-row">
      <aside className="w-full md:w-64 border-r border-border bg-card/50 backdrop-blur-md flex flex-col">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-primary animate-pulse" />
          <div>
            <h1 className="font-bold text-lg tracking-wider">FX100</h1>
            <p className="text-xs text-muted-foreground">RISK SENTINEL</p>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 group cursor-pointer",
                    isActive ? "bg-primary/10 text-primary border-l-2 border-primary" : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                  )}
                >
                  <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "group-hover:text-foreground")} />
                  <span className="font-medium">{item.name}</span>
                  {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary animate-ping" />}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className={`rounded-md border p-3 ${criticalCount > 0 ? "bg-destructive/10 border-destructive/20" : "bg-primary/10 border-primary/20"}`}>
            <div className={`mb-1 flex items-center gap-2 ${criticalCount > 0 ? "text-destructive" : "text-primary"}`}>
              <div className={`h-2 w-2 rounded-full ${criticalCount > 0 ? "bg-destructive" : "bg-primary"} animate-pulse`} />
              <span className="text-xs font-bold uppercase">System Status</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {snapshot
                ? `${activeCount} active incidents${criticalCount > 0 ? `, ${criticalCount} critical` : ", no critical incidents"}. ${snapshot.environment.source}.`
                : "Snapshot not loaded yet."}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto relative">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-50 bg-[length:100%_2px,3px_100%] opacity-20" />
        <div className="container py-8 relative z-10">{children}</div>
      </main>
    </div>
  );
}
