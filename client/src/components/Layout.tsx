import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutDashboard, AlertTriangle, Settings, Activity, ShieldAlert } from "lucide-react";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { name: "Dashboard", path: "/", icon: LayoutDashboard },
    { name: "Monitoring", path: "/monitoring", icon: Activity },
    { name: "Alerts", path: "/alerts", icon: AlertTriangle },
    { name: "Risk Parameters", path: "/parameters", icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-mono flex flex-col md:flex-row">
      {/* Sidebar */}
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
                    isActive
                      ? "bg-primary/10 text-primary border-l-2 border-primary"
                      : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
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
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-bold uppercase">System Status</span>
            </div>
            <p className="text-xs text-muted-foreground">All systems operational. No active L3 threats detected.</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative">
        {/* Scanline effect overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-50 bg-[length:100%_2px,3px_100%] opacity-20" />
        
        <div className="container py-8 relative z-10">
          {children}
        </div>
      </main>
    </div>
  );
}
