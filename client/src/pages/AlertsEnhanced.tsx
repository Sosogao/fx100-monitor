import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle, Clock, ShieldAlert, Filter, X, Play, RotateCcw, TrendingDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getParameterRecommendations, calculateRecoveryTimeline } from "@/lib/riskCalculator";

interface Alert {
  id: number;
  severity: "L1" | "L2" | "L3";
  type: string;
  asset: string;
  trigger: string;
  message: string;
  time: string;
  status: "Active" | "Investigating" | "Resolved";
  value?: number;
  threshold?: number;
}

interface ActionLog {
  id: number;
  alertId: number;
  asset: string;
  action: string;
  timestamp: string;
  status: "Pending" | "Executed" | "Failed";
  parametersBefore: Record<string, any>;
  parametersAfter: Record<string, any>;
}

interface RecoveryState {
  id: number;
  asset: string;
  level: "L1" | "L2" | "L3";
  triggeredAt: string;
  recoveryStatus: "Triggered" | "Acknowledged" | "Action Executed" | "Monitoring" | "Partially Recovered" | "Fully Recovered";
  executedActions: string[];
  nextRecoveryStep?: string;
  estimatedRecoveryTime?: string;
}

const alertsData: Alert[] = [
  {
    id: 1,
    severity: "L3",
    type: "Price Change Extreme",
    asset: "SUI-USD",
    trigger: "Price Change > VaR_95",
    message: "Price changed -8.5% in 5 minutes, exceeding VaR_95 threshold of -6.2%.",
    time: "2 mins ago",
    status: "Active",
    value: -8.5,
    threshold: -6.2,
  },
  {
    id: 2,
    severity: "L2",
    type: "Skew Emergency",
    asset: "SOL-USD",
    trigger: "Skew >= 0.7",
    message: "Skew reached 0.72, indicating strong directional imbalance.",
    time: "15 mins ago",
    status: "Investigating",
    value: 0.72,
    threshold: 0.7,
  },
  {
    id: 3,
    severity: "L1",
    type: "Volatility Warning",
    asset: "ETH-USD",
    trigger: "Vol >= P99",
    message: "1h realized volatility reached 3.2%, approaching P99 threshold of 3.5%.",
    time: "1 hour ago",
    status: "Resolved",
    value: 3.2,
    threshold: 3.5,
  },
  {
    id: 4,
    severity: "L2",
    type: "Funding Rate Spike",
    asset: "ARB-USD",
    trigger: "Funding >= 1000% APY",
    message: "Funding rate annualized to 1250%, indicating extreme market stress.",
    time: "2 hours ago",
    status: "Resolved",
    value: 1250,
    threshold: 1000,
  },
];

const actionLogsData: ActionLog[] = [
  {
    id: 1,
    alertId: 1,
    asset: "SUI-USD",
    action: "Reduce Leverage: 100x → 20x",
    timestamp: "2 mins ago",
    status: "Executed",
    parametersBefore: { maxLev: 100 },
    parametersAfter: { maxLev: 20 },
  },
  {
    id: 2,
    alertId: 1,
    asset: "SUI-USD",
    action: "Reduce OI Cap: 100% → 20%",
    timestamp: "2 mins ago",
    status: "Executed",
    parametersBefore: { globalCap: 1.0 },
    parametersAfter: { globalCap: 0.2 },
  },
  {
    id: 3,
    alertId: 2,
    asset: "SOL-USD",
    action: "Enable Price Impact: 1x → 1.5x",
    timestamp: "15 mins ago",
    status: "Executed",
    parametersBefore: { priceImpactMultiplier: 1.0 },
    parametersAfter: { priceImpactMultiplier: 1.5 },
  },
];

const recoveryStatesData: RecoveryState[] = [
  {
    id: 1,
    asset: "SUI-USD",
    level: "L3",
    triggeredAt: "2 mins ago",
    recoveryStatus: "Action Executed",
    executedActions: ["Reduce Leverage: 100x → 20x", "Reduce OI Cap: 100% → 20%"],
    nextRecoveryStep: "Monitor price stability for 30 minutes",
    estimatedRecoveryTime: "~45 minutes",
  },
  {
    id: 2,
    asset: "SOL-USD",
    level: "L2",
    triggeredAt: "15 mins ago",
    recoveryStatus: "Monitoring",
    executedActions: ["Enable Price Impact: 1x → 1.5x"],
    nextRecoveryStep: "Check if Skew normalizes below 0.6",
    estimatedRecoveryTime: "~30 minutes",
  },
];

export default function AlertsEnhanced() {
  const [activeTab, setActiveTab] = useState("active");
  const [filterSeverity, setFilterSeverity] = useState<string>("all");
  const [filterAsset, setFilterAsset] = useState<string>("all");
  const [filterTrigger, setFilterTrigger] = useState<string>("all");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [showActionModal, setShowActionModal] = useState(false);

  const filteredAlerts = alertsData.filter((alert) => {
    const severityMatch = filterSeverity === "all" || alert.severity === filterSeverity;
    const assetMatch = filterAsset === "all" || alert.asset === filterAsset;
    const triggerMatch = filterTrigger === "all" || alert.trigger.includes(filterTrigger);
    return severityMatch && assetMatch && triggerMatch;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "L1":
        return "bg-yellow-500/20 text-yellow-500 border-yellow-500";
      case "L2":
        return "bg-orange-500/20 text-orange-500 border-orange-500";
      case "L3":
        return "bg-destructive/20 text-destructive border-destructive";
      default:
        return "bg-primary/20 text-primary";
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "L1":
        return <AlertTriangle className="w-5 h-5" />;
      case "L2":
        return <ShieldAlert className="w-5 h-5" />;
      case "L3":
        return <ShieldAlert className="w-5 h-5 animate-pulse" />;
      default:
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">System Alerts & Emergency</h2>
          <p className="text-muted-foreground">Monitor, filter, and manage system alerts with action tracking and recovery management.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-primary/20">
          <TabsTrigger value="active" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Active Alerts
          </TabsTrigger>
          <TabsTrigger value="actions" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Action Log
          </TabsTrigger>
          <TabsTrigger value="recovery" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Recovery Tracking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {/* Filters */}
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Alert Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Severity Level</Label>
                  <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                    <SelectTrigger className="bg-background/50 border-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="L1">L1 - Warning</SelectItem>
                      <SelectItem value="L2">L2 - Emergency</SelectItem>
                      <SelectItem value="L3">L3 - Kill-Switch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Asset</Label>
                  <Select value={filterAsset} onValueChange={setFilterAsset}>
                    <SelectTrigger className="bg-background/50 border-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assets</SelectItem>
                      <SelectItem value="ETH-USD">ETH-USD</SelectItem>
                      <SelectItem value="SOL-USD">SOL-USD</SelectItem>
                      <SelectItem value="SUI-USD">SUI-USD</SelectItem>
                      <SelectItem value="ARB-USD">ARB-USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Trigger Type</Label>
                  <Select value={filterTrigger} onValueChange={setFilterTrigger}>
                    <SelectTrigger className="bg-background/50 border-primary/20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Price">Price Change</SelectItem>
                      <SelectItem value="Skew">Skew</SelectItem>
                      <SelectItem value="Volatility">Volatility</SelectItem>
                      <SelectItem value="Funding">Funding Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Alerts List */}
          <div className="grid gap-4">
            {filteredAlerts.map((alert) => (
              <Card key={alert.id} className={`bg-card/50 border-l-4 tech-border ${
                alert.severity === "L3" ? "border-l-destructive border-primary/20" :
                alert.severity === "L2" ? "border-l-orange-500 border-primary/20" :
                "border-l-yellow-500 border-primary/20"
              }`}>
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                        {getSeverityIcon(alert.severity)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-lg">{alert.type}</h3>
                          <Badge variant="outline" className="border-primary/30 text-primary">{alert.asset}</Badge>
                          <Badge className={`text-xs font-bold ${getSeverityColor(alert.severity)}`}>
                            {alert.severity}
                          </Badge>
                          <span className="text-xs text-muted-foreground flex items-center ml-auto md:ml-0">
                            <Clock className="w-3 h-3 mr-1" /> {alert.time}
                          </span>
                        </div>
                        <p className="text-muted-foreground text-sm mb-2">{alert.message}</p>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="font-mono">Trigger: {alert.trigger}</span>
                          {alert.value !== undefined && alert.threshold !== undefined && (
                            <span className="font-mono">
                              Value: <span className="text-primary">{alert.value}</span> / Threshold: <span className="text-destructive">{alert.threshold}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <Badge className={`
                        ${alert.status === "Active" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" :
                          alert.status === "Investigating" ? "bg-orange-500 text-white hover:bg-orange-500/90" :
                          "bg-primary/20 text-primary hover:bg-primary/30"}
                      `}>
                        {alert.status}
                      </Badge>
                      {alert.status !== "Resolved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-primary/50 text-primary hover:bg-primary/10"
                          onClick={() => { setSelectedAlert(alert); setShowActionModal(true); }}
                        >
                          <Play className="w-3 h-3 mr-1" />
                          Take Action
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Action Modal */}
          {showActionModal && selectedAlert && (
            <Card className="bg-card border-primary/20 tech-border fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:transform md:-translate-x-1/2 md:-translate-y-1/2 md:w-96 z-50">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-primary">Execute Action</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowActionModal(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Asset: {selectedAlert.asset}</Label>
                  <Label className="text-sm font-semibold">Alert: {selectedAlert.type}</Label>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Recommended Actions</Label>
                  <div className="space-y-2 bg-background/50 p-3 rounded border border-primary/20 text-xs">
                    {selectedAlert.severity === 'L3' && (
                      <>
                        <p className="text-muted-foreground font-semibold mb-2">Level 3 Alert - Emergency</p>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span className="font-mono font-bold text-primary">Max Leverage</span><span className="text-yellow-500">Reduce to 20x</span></div>
                          <p className="text-muted-foreground italic">Emergency leverage reduction</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span className="font-mono font-bold text-primary">Price Impact</span><span className="text-yellow-500">1.0x → 2.0x</span></div>
                          <p className="text-muted-foreground italic">Maximum price impact</p>
                        </div>
                      </>
                    )}
                    {selectedAlert.severity === 'L2' && (
                      <>
                        <p className="text-muted-foreground font-semibold mb-2">Level 2 Alert - High Risk</p>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span className="font-mono font-bold text-primary">Price Impact</span><span className="text-yellow-500">1.0x → 1.5x</span></div>
                          <p className="text-muted-foreground italic">Significantly increase price impact</p>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span className="font-mono font-bold text-primary">Max Leverage</span><span className="text-yellow-500">Reduce by 20%</span></div>
                          <p className="text-muted-foreground italic">Reduce leverage to limit exposure</p>
                        </div>
                      </>
                    )}
                    {selectedAlert.severity === 'L1' && (
                      <>
                        <p className="text-muted-foreground font-semibold mb-2">Level 1 Alert - Elevated Risk</p>
                        <div className="space-y-1">
                          <div className="flex justify-between"><span className="font-mono font-bold text-primary">Price Impact</span><span className="text-yellow-500">1.0x → 1.2x</span></div>
                          <p className="text-muted-foreground italic">Increase price impact to reduce volatility</p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="space-y-2">
                    {["Reduce Leverage", "Reduce OI Cap", "Adjust Funding Cap", "Enable Price Impact", "Pause New Orders", "Force Close", "Enable Kill-Switch"].map((action) => (
                      <Button
                        key={action}
                        variant="outline"
                        className="w-full justify-start border-primary/30 hover:bg-primary/10"
                      >
                        {action}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => setShowActionModal(false)}
                  >
                    Execute
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-primary/50"
                    onClick={() => setShowActionModal(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Action Execution Log</CardTitle>
              <CardDescription>Track all executed actions with parameter changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {actionLogsData.map((log) => (
                  <div key={log.id} className="p-4 border border-primary/20 rounded hover:bg-primary/5 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-bold">{log.action}</h4>
                        <p className="text-sm text-muted-foreground">{log.asset} • {log.timestamp}</p>
                      </div>
                      <Badge className={
                        log.status === "Executed" ? "bg-primary/20 text-primary" :
                        log.status === "Pending" ? "bg-yellow-500/20 text-yellow-500" :
                        "bg-destructive/20 text-destructive"
                      }>
                        {log.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-muted-foreground">Before:</span>
                        <div className="text-primary">{JSON.stringify(log.parametersBefore)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">After:</span>
                        <div className="text-primary">{JSON.stringify(log.parametersAfter)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recovery" className="space-y-4">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Emergency Recovery Tracking</CardTitle>
              <CardDescription>Monitor and manage recovery from emergency states.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {recoveryStatesData.map((recovery) => (
                <div key={recovery.id} className="p-4 border border-primary/20 rounded">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-bold text-lg">{recovery.asset}</h4>
                      <p className="text-sm text-muted-foreground">Triggered {recovery.triggeredAt}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={
                        recovery.level === "L3" ? "bg-destructive/20 text-destructive" :
                        recovery.level === "L2" ? "bg-orange-500/20 text-orange-500" :
                        "bg-yellow-500/20 text-yellow-500"
                      }>
                        {recovery.level}
                      </Badge>
                      <Badge className="bg-primary/20 text-primary">
                        {recovery.recoveryStatus}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold mb-1">Executed Actions:</p>
                      <div className="space-y-1">
                        {recovery.executedActions.map((action, idx) => (
                          <div key={idx} className="text-sm text-muted-foreground flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-primary" />
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Next Step</p>
                        <p className="text-sm font-mono text-primary">{recovery.nextRecoveryStep}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Est. Recovery Time</p>
                        <p className="text-sm font-mono text-primary">{recovery.estimatedRecoveryTime}</p>
                      </div>
                    </div>

                    {recovery.recoveryStatus !== "Fully Recovered" && (
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" className="flex-1 bg-primary/20 text-primary hover:bg-primary/30">
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Recover to Previous Level
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 border-primary/50">
                          <TrendingDown className="w-3 h-3 mr-1" />
                          Further Reduce Risk
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
