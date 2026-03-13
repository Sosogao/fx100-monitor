import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ArrowDownRight, Activity, AlertTriangle, ShieldCheck, Zap, TrendingUp, Clock } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";

const data = [
  { time: "00:00", value: 1800 },
  { time: "04:00", value: 1820 },
  { time: "08:00", value: 1810 },
  { time: "12:00", value: 1850 },
  { time: "16:00", value: 1840 },
  { time: "20:00", value: 1880 },
  { time: "24:00", value: 1900 },
];

const assets = [
  { symbol: "ETH-USD", price: "3,245.67", change: "+2.4%", skew: "0.12", status: "Normal", risk: "Low", volatility: "2.1%" },
  { symbol: "BTC-USD", price: "64,123.45", change: "+1.2%", skew: "-0.05", status: "Normal", risk: "Low", volatility: "1.8%" },
  { symbol: "SOL-USD", price: "145.89", change: "-5.6%", skew: "0.45", status: "Warning", risk: "Medium", volatility: "3.8%" },
  { symbol: "SUI-USD", price: "1.89", change: "+12.4%", skew: "0.78", status: "Emergency", risk: "High", volatility: "5.2%" },
];

const emergencyStates = [
  { asset: "SUI-USD", level: "L3", action: "Reduce Leverage: 100x → 20x", status: "Executing" },
  { asset: "SOL-USD", level: "L2", action: "Enable Price Impact: 1x → 1.5x", status: "Monitoring" },
];

const volatilityAlerts = [
  { asset: "SUI-USD", current: "5.2%", threshold: "4.5%", severity: "Critical" },
  { asset: "SOL-USD", current: "3.8%", threshold: "4.2%", severity: "Elevated" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Command Center</h2>
          <p className="text-muted-foreground">Real-time risk monitoring and parameter control.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
            <Zap className="w-4 h-4 mr-2" />
            System Check
          </Button>
          <Button variant="destructive" className="animate-pulse">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Emergency Stop
          </Button>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value Locked</CardTitle>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">$124,592,304</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <ArrowUpRight className="h-3 w-3 text-primary mr-1" />
              <span className="text-primary">+2.5%</span> from last hour
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Skew</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">0.15</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              <span className="text-primary">Long Heavy</span> (Balanced)
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">4</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              1 L1, 1 L2, 1 L3, 1 Volatility
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Health</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">99.9%</div>
            <p className="text-xs text-muted-foreground flex items-center mt-1">
              All nodes operational
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Emergency & Volatility Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-destructive/10 border-destructive/30 tech-border">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Active Emergency States
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {emergencyStates.map((state, idx) => (
              <div key={idx} className="text-sm flex items-center justify-between p-2 bg-background/50 rounded">
                <div>
                  <span className="font-bold">{state.asset}</span>
                  <span className="text-xs text-muted-foreground ml-2">{state.action}</span>
                </div>
                <Badge className={state.level === "L3" ? "bg-destructive/20 text-destructive" : "bg-orange-500/20 text-orange-500"}>{state.level}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-yellow-500/10 border-yellow-500/30 tech-border">
          <CardHeader>
            <CardTitle className="text-yellow-500 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Price Volatility Warnings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {volatilityAlerts.map((alert, idx) => (
              <div key={idx} className="text-sm flex items-center justify-between p-2 bg-background/50 rounded">
                <div>
                  <span className="font-bold">{alert.asset}</span>
                  <span className="text-xs text-muted-foreground ml-2">{alert.current} / {alert.threshold}</span>
                </div>
                <Badge className={alert.severity === "Critical" ? "bg-destructive/20 text-destructive" : "bg-yellow-500/20 text-yellow-500"}>{alert.severity}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Main Chart & Asset List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary">Global Exposure (ETH-USD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                  <XAxis dataKey="time" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)', color: 'var(--foreground)' }}
                    itemStyle={{ color: 'var(--primary)' }}
                  />
                  <Area type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-primary/20 tech-border">
          <CardHeader>
            <CardTitle className="text-primary">Asset Risk Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {assets.map((asset) => (
                <div key={asset.symbol} className="flex items-center justify-between p-3 border border-border bg-background/50 rounded hover:bg-accent/10 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${
                      asset.status === 'Normal' ? 'bg-primary' : 
                      asset.status === 'Warning' ? 'bg-yellow-500' : 'bg-destructive'
                    } animate-pulse`} />
                    <div className="flex-1">
                      <div className="font-bold group-hover:text-primary transition-colors">{asset.symbol}</div>
                      <div className="text-xs text-muted-foreground">Skew: {asset.skew} | Vol: {asset.volatility}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono">{asset.price}</div>
                    <div className={`text-xs ${asset.change.startsWith('+') ? 'text-primary' : 'text-destructive'}`}>
                      {asset.change}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
