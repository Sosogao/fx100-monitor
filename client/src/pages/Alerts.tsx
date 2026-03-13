import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle, Clock, ShieldAlert } from "lucide-react";

const alerts = [
  {
    id: 1,
    severity: "Critical",
    type: "L3 Breach",
    asset: "SUI-USD",
    message: "Oracle deviation > 2% for 60s. Kill-switch recommended.",
    time: "2 mins ago",
    status: "Active",
  },
  {
    id: 2,
    severity: "High",
    type: "L2 Emergency",
    asset: "SOL-USD",
    message: "Skew > 0.6. Funding rate spike detected.",
    time: "15 mins ago",
    status: "Investigating",
  },
  {
    id: 3,
    severity: "Medium",
    type: "L1 Warning",
    asset: "ETH-USD",
    message: "Volatility approaching P95 threshold.",
    time: "1 hour ago",
    status: "Resolved",
  },
  {
    id: 4,
    severity: "Medium",
    type: "L1 Warning",
    asset: "BTC-USD",
    message: "OI utilization > 80%.",
    time: "2 hours ago",
    status: "Resolved",
  },
];

export default function Alerts() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">System Alerts</h2>
          <p className="text-muted-foreground">Active threats and historical incident logs.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
            <CheckCircle className="w-4 h-4 mr-2" />
            Acknowledge All
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {alerts.map((alert) => (
          <Card key={alert.id} className={`bg-card/50 border-l-4 tech-border ${
            alert.severity === 'Critical' ? 'border-l-destructive border-primary/20' : 
            alert.severity === 'High' ? 'border-l-orange-500 border-primary/20' : 
            'border-l-yellow-500 border-primary/20'
          }`}>
            <CardContent className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-full ${
                  alert.severity === 'Critical' ? 'bg-destructive/20 text-destructive animate-pulse' : 
                  alert.severity === 'High' ? 'bg-orange-500/20 text-orange-500' : 
                  'bg-yellow-500/20 text-yellow-500'
                }`}>
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg">{alert.type}</h3>
                    <Badge variant="outline" className="border-primary/30 text-primary">{alert.asset}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center">
                      <Clock className="w-3 h-3 mr-1" /> {alert.time}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{alert.message}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                <Badge className={`
                  ${alert.status === 'Active' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : 
                    alert.status === 'Investigating' ? 'bg-orange-500 text-white hover:bg-orange-500/90' : 
                    'bg-primary/20 text-primary hover:bg-primary/30'}
                `}>
                  {alert.status}
                </Badge>
                {alert.status !== 'Resolved' && (
                  <Button size="sm" variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
                    Take Action
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
