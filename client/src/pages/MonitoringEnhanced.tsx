'use client';
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertTriangle, TrendingUp, TrendingDown, Activity, Zap, Eye, DollarSign, Pin, Search } from "lucide-react";
import { calculateRiskScore, calculateVarEs, determineAlertLevel, PRICE_CHANGE_DATA } from "@/lib/riskCalculator";

// Mock data for monitoring
const assetMonitoringData = [
  {
    asset: "ETH-USD",
    tier: "Tier 1",
    markPrice: 3245.32,
    oraclePrice: 3244.98,
    priceDeviation: 0.01,
    currentOI: 125000000,
    oiChange24h: 12.5,
    fundingRate: 0.00012,
    fundingRateAnnualized: 43.8,
    binanceFundingRate: 0.00008,
    binanceFundingRateAnnualized: 29.2,
    skew: 0.35,
    volatility1h: 2.1,
    volatilityP99: 3.5,
    volatilityStatus: "Normal",
    topLongOI: 45,
    topShortOI: 55,
    riskScore: 2.3,
    var99: 5.66,
    es99: 4.71,
  },
  {
    asset: "SOL-USD",
    tier: "Tier 2",
    markPrice: 198.45,
    oraclePrice: 198.12,
    priceDeviation: 0.17,
    currentOI: 85000000,
    oiChange24h: -5.2,
    fundingRate: 0.00025,
    fundingRateAnnualized: 91.25,
    binanceFundingRate: 0.00018,
    binanceFundingRateAnnualized: 65.7,
    skew: 0.58,
    volatility1h: 3.8,
    volatilityP99: 4.2,
    volatilityStatus: "Elevated",
    topLongOI: 52,
    topShortOI: 48,
    riskScore: 5.8,
    var99: 8.18,
    es99: 6.95,
  },
  {
    asset: "SUI-USD",
    tier: "Tier 2",
    markPrice: 3.82,
    oraclePrice: 3.75,
    priceDeviation: 1.87,
    currentOI: 45000000,
    oiChange24h: 28.3,
    fundingRate: 0.00045,
    fundingRateAnnualized: 164.25,
    binanceFundingRate: 0.00032,
    binanceFundingRateAnnualized: 116.8,
    skew: 0.72,
    volatility1h: 5.2,
    volatilityP99: 4.5,
    volatilityStatus: "High",
    topLongOI: 65,
    topShortOI: 35,
    riskScore: 8.2,
    var99: 14.16,
    es99: 12.74,
  },
  {
    asset: "BTC-USD",
    tier: "Tier 1",
    markPrice: 42850.50,
    oraclePrice: 42851.20,
    priceDeviation: 0.02,
    currentOI: 250000000,
    oiChange24h: 8.3,
    fundingRate: 0.00010,
    fundingRateAnnualized: 36.5,
    binanceFundingRate: 0.00007,
    binanceFundingRateAnnualized: 25.6,
    skew: 0.28,
    volatility1h: 1.8,
    volatilityP99: 3.2,
    volatilityStatus: "Normal",
    topLongOI: 48,
    topShortOI: 52,
    riskScore: 1.9,
    var99: 3.48,
    es99: 2.99,
  },
  {
    asset: "AVAX-USD",
    tier: "Tier 2",
    markPrice: 32.15,
    oraclePrice: 31.95,
    priceDeviation: 0.62,
    currentOI: 28000000,
    oiChange24h: 15.7,
    fundingRate: 0.00032,
    fundingRateAnnualized: 116.8,
    binanceFundingRate: 0.00025,
    binanceFundingRateAnnualized: 91.25,
    skew: 0.64,
    volatility1h: 4.2,
    volatilityP99: 4.8,
    volatilityStatus: "Elevated",
    topLongOI: 58,
    topShortOI: 42,
    riskScore: 6.5,
    var99: 10.70,
    es99: 9.28,
  },
];

const priceVolatilityData = [
  { time: "00:00", ETH: 2.1, SOL: 2.8, SUI: 3.2 },
  { time: "04:00", ETH: 2.3, SOL: 3.1, SUI: 3.8 },
  { time: "08:00", ETH: 2.0, SOL: 3.5, SUI: 4.2 },
  { time: "12:00", ETH: 2.4, SOL: 3.8, SUI: 5.1 },
  { time: "16:00", ETH: 2.2, SOL: 3.9, SUI: 5.2 },
  { time: "20:00", ETH: 2.1, SOL: 3.6, SUI: 4.8 },
  { time: "24:00", ETH: 2.3, SOL: 3.2, SUI: 3.5 },
];

const fundingRateData = [
  { time: "00:00", ETH: 0.00008, SOL: 0.00015, SUI: 0.00035 },
  { time: "04:00", ETH: 0.0001, SOL: 0.00018, SUI: 0.00042 },
  { time: "08:00", ETH: 0.00012, SOL: 0.0002, SUI: 0.00048 },
  { time: "12:00", ETH: 0.00015, SOL: 0.00022, SUI: 0.00052 },
  { time: "16:00", ETH: 0.00018, SOL: 0.00025, SUI: 0.00045 },
  { time: "20:00", ETH: 0.00012, SOL: 0.00023, SUI: 0.00038 },
  { time: "24:00", ETH: 0.0001, SOL: 0.00018, SUI: 0.00032 },
];

const oiTrendData = [
  { time: "00:00", ETH: 120, SOL: 90, SUI: 35 },
  { time: "04:00", ETH: 118, SOL: 92, SUI: 38 },
  { time: "08:00", ETH: 122, SOL: 88, SUI: 42 },
  { time: "12:00", ETH: 125, SOL: 85, SUI: 45 },
  { time: "16:00", ETH: 128, SOL: 87, SUI: 48 },
  { time: "20:00", ETH: 126, SOL: 86, SUI: 46 },
  { time: "24:00", ETH: 125, SOL: 85, SUI: 45 },
];

const getVolatilityStatus = (current: number, p99: number) => {
  const ratio = current / p99;
  if (ratio < 0.7) return { status: "Normal", color: "text-primary", bgColor: "bg-primary/20" };
  if (ratio < 0.85) return { status: "Elevated", color: "text-yellow-500", bgColor: "bg-yellow-500/20" };
  if (ratio < 1.0) return { status: "High", color: "text-orange-500", bgColor: "bg-orange-500/20" };
  return { status: "Critical", color: "text-destructive", bgColor: "bg-destructive/20" };
};

export default function MonitoringEnhanced() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedAsset, setSelectedAsset] = useState(assetMonitoringData[0]);
  const [pinnedAssets, setPinnedAssets] = useState<string[]>(["ETH-USD"]);
  const [searchQuery, setSearchQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<"All" | "Tier 1" | "Tier 2">("All");

  // Toggle pin status
  const togglePin = (assetName: string) => {
    setPinnedAssets((prev) =>
      prev.includes(assetName) ? prev.filter((a) => a !== assetName) : [...prev, assetName]
    );
  };

  // Filter and sort assets
  const filteredAssets = useMemo(() => {
    let filtered = assetMonitoringData.filter((asset) => {
      const matchesSearch = asset.asset.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTier = tierFilter === "All" || asset.tier === tierFilter;
      return matchesSearch && matchesTier;
    });

    // Sort: pinned first, then by risk score
    return filtered.sort((a, b) => {
      const aPinned = pinnedAssets.includes(a.asset);
      const bPinned = pinnedAssets.includes(b.asset);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      return a.riskScore - b.riskScore;
    });
  }, [searchQuery, tierFilter, pinnedAssets]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Market Monitoring</h2>
          <p className="text-muted-foreground">Real-time monitoring of market conditions, funding rates, and volatility metrics.</p>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <Card className="bg-card/50 border-primary/20 tech-border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search assets (ETH, SOL, BTC...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-background/50 border-primary/20"
              />
            </div>
            <div className="flex gap-2">
              {(["All", "Tier 1", "Tier 2"] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setTierFilter(tier)}
                  className={`px-4 py-2 rounded border transition-all ${
                    tierFilter === tier
                      ? "bg-primary/20 border-primary/50 text-primary"
                      : "bg-background/50 border-primary/20 text-muted-foreground hover:border-primary/30"
                  }`}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            📌 Click the pin icon to keep assets at the top | {pinnedAssets.length} pinned
          </p>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-primary/20">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Market Overview
          </TabsTrigger>
          <TabsTrigger value="volatility" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Volatility Analysis
          </TabsTrigger>
          <TabsTrigger value="funding" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Funding Rates
          </TabsTrigger>
          <TabsTrigger value="oi" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Open Interest
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Asset Cards with Pin functionality */}
          <div className="grid gap-4">
            {filteredAssets.map((asset) => {
              const isPinned = pinnedAssets.includes(asset.asset);
              return (
                <Card
                  key={asset.asset}
                  className={`bg-card/50 border-primary/20 tech-border cursor-pointer transition-all hover:border-primary/50 ${
                    selectedAsset.asset === asset.asset ? "border-primary/50 ring-1 ring-primary/30" : ""
                  } ${isPinned ? "ring-1 ring-primary/50" : ""}`}
                  onClick={() => setSelectedAsset(asset)}
                >
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                      {/* Asset Info with Pin Button */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePin(asset.asset);
                            }}
                            className={`p-1 rounded transition-all ${
                              isPinned ? "text-primary bg-primary/20" : "text-muted-foreground hover:text-primary hover:bg-primary/10"
                            }`}
                            title={isPinned ? "Unpin" : "Pin"}
                          >
                            <Pin className="w-4 h-4" fill={isPinned ? "currentColor" : "none"} />
                          </button>
                          <h3 className="font-bold text-lg text-primary">{asset.asset}</h3>
                          <Badge className={asset.tier === "Tier 1" ? "bg-primary/20 text-primary" : "bg-yellow-500/20 text-yellow-500"}>
                            {asset.tier}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Mark Price:</span>
                            <span className="font-mono text-primary">${asset.markPrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Oracle Price:</span>
                            <span className="font-mono text-primary">${asset.oraclePrice.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Deviation:</span>
                            <span className={`font-mono ${asset.priceDeviation > 1 ? "text-destructive" : "text-primary"}`}>
                              {asset.priceDeviation.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* OI & Funding */}
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-3">OPEN INTEREST & FUNDING</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Current OI:</span>
                            <span className="font-mono text-primary">${(asset.currentOI / 1000000).toFixed(0)}M</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">24h Change:</span>
                            <span className={`font-mono ${asset.oiChange24h > 0 ? "text-primary" : "text-destructive"}`}>
                              {asset.oiChange24h > 0 ? "+" : ""}{asset.oiChange24h.toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Funding Rate:</span>
                            <span className="font-mono text-primary">{(asset.fundingRate * 100).toFixed(4)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Annualized:</span>
                            <span className={`font-mono ${asset.fundingRateAnnualized > 100 ? "text-destructive" : "text-primary"}`}>
                              {asset.fundingRateAnnualized.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Skew & Volatility */}
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-3">SKEW & VOLATILITY</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Skew:</span>
                            <span className={`font-mono ${asset.skew > 0.6 ? "text-destructive" : asset.skew > 0.4 ? "text-yellow-500" : "text-primary"}`}>
                              {(asset.skew * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Vol 1h:</span>
                            <span className="font-mono text-primary">{asset.volatility1h.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">P99 Threshold:</span>
                            <span className="font-mono text-primary">{asset.volatilityP99.toFixed(2)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <Badge variant="outline" className="text-xs">{asset.volatilityStatus}</Badge>
                          </div>
                        </div>
                      </div>

                      {/* OI Distribution */}
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-3">OI DISTRIBUTION</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Top Long OI:</span>
                            <span className="font-mono text-primary">{asset.topLongOI}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Top Short OI:</span>
                            <span className="font-mono text-primary">{asset.topShortOI}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Concentration:</span>
                            <span className={`font-mono ${asset.topLongOI + asset.topShortOI > 100 ? "text-destructive" : "text-primary"}`}>
                              {(asset.topLongOI + asset.topShortOI).toFixed(0)}%
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Risk Score:</span>
                            <Badge className={asset.riskScore > 7 ? "bg-destructive/20 text-destructive" : asset.riskScore > 4 ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}>
                              {asset.riskScore.toFixed(1)}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      {/* Risk Indicators */}
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold mb-3">RISK INDICATORS</p>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-muted-foreground">Risk Score</span>
                              <span className="text-xs font-mono font-bold text-primary">{asset.riskScore.toFixed(1)}/10</span>
                            </div>
                            <div className="w-full bg-background/50 rounded h-2">
                              <div
                                className={`h-full rounded transition-all ${asset.riskScore > 7 ? "bg-destructive" : asset.riskScore > 4 ? "bg-yellow-500" : "bg-primary"}`}
                                style={{ width: `${(asset.riskScore / 10) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">VaR (99%):</span>
                              <span className="font-mono text-primary font-bold">{asset.var99?.toFixed(2) || (asset.volatility1h * 0.8).toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">ES (99%):</span>
                              <span className="font-mono text-primary font-bold">{asset.es99?.toFixed(2) || (asset.volatility1h * 1.2).toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">OI Conc:</span>
                              <span className={`font-mono ${asset.topLongOI + asset.topShortOI > 100 ? "text-destructive" : "text-primary"}`}>
                                {(asset.topLongOI + asset.topShortOI).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="pt-1 border-t border-primary/10">
                            <Badge className={asset.riskScore > 7 ? "bg-destructive/20 text-destructive w-full justify-center" : asset.riskScore > 4 ? "bg-yellow-500/20 text-yellow-500 w-full justify-center" : "bg-primary/20 text-primary w-full justify-center"}>
                              {asset.riskScore > 7 ? "High Risk" : asset.riskScore > 4 ? "Medium Risk" : "Low Risk"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="volatility" className="space-y-4">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Multi-Timeframe Volatility Analysis
              </CardTitle>
              <CardDescription>5-second, 5-minute, and 15-minute volatility monitoring with Tier-based thresholds</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="5s" className="space-y-4">
                <TabsList className="bg-card/50 border border-primary/20">
                  <TabsTrigger value="5s" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">5-Second (Extreme)</TabsTrigger>
                  <TabsTrigger value="5m" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">5-Minute (Warning)</TabsTrigger>
                  <TabsTrigger value="15m" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">15-Minute (Decision)</TabsTrigger>
                </TabsList>

                <TabsContent value="5s" className="space-y-4">
                  <div className="p-4 bg-background/50 rounded border border-destructive/30">
                    <p className="text-sm text-muted-foreground mb-3">5-Second Extreme Speed Monitoring - Triggers Level 2 Emergency</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {filteredAssets.map((asset) => {
                        const tier = asset.tier === "Tier 1" ? "Tier 1" : "Tier 2";
                        const threshold = tier === "Tier 1" ? 0.83011 : 1.80447;
                        const current = asset.volatility1h * 0.4;
                        const ratio = ((current / threshold) * 100).toFixed(0);
                        const status = current > threshold ? "CRITICAL" : current > threshold * 0.8 ? "HIGH" : "NORMAL";
                        return (
                          <div key={asset.asset} className="p-3 bg-background/50 rounded border border-primary/10">
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-semibold text-sm">{asset.asset}</p>
                              <Badge className={status === "CRITICAL" ? "bg-destructive/20 text-destructive" : status === "HIGH" ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}>
                                {status}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Current:</span>
                                <span className="font-mono">{current.toFixed(4)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Threshold:</span>
                                <span className="font-mono">{threshold.toFixed(5)}%</span>
                              </div>
                              <div className="flex justify-between font-bold">
                                <span className="text-muted-foreground">Ratio:</span>
                                <span className={current > threshold ? "text-destructive" : "text-primary"}>{ratio}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="5m" className="space-y-4">
                  <div className="p-4 bg-background/50 rounded border border-yellow-500/30">
                    <p className="text-sm text-muted-foreground mb-3">5-Minute Warning Level - Triggers Level 3 Emergency</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {filteredAssets.map((asset) => {
                        const tier = asset.tier === "Tier 1" ? "Tier 1" : "Tier 2";
                        const threshold = tier === "Tier 1" ? 5.65810 : 14.16100;
                        const current = asset.volatility1h * 2.5;
                        const ratio = ((current / threshold) * 100).toFixed(0);
                        const status = current > threshold ? "CRITICAL" : current > threshold * 0.8 ? "HIGH" : "NORMAL";
                        return (
                          <div key={asset.asset} className="p-3 bg-background/50 rounded border border-primary/10">
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-semibold text-sm">{asset.asset}</p>
                              <Badge className={status === "CRITICAL" ? "bg-destructive/20 text-destructive" : status === "HIGH" ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}>
                                {status}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Current:</span>
                                <span className="font-mono">{current.toFixed(4)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Threshold:</span>
                                <span className="font-mono">{threshold.toFixed(5)}%</span>
                              </div>
                              <div className="flex justify-between font-bold">
                                <span className="text-muted-foreground">Ratio:</span>
                                <span className={current > threshold ? "text-destructive" : "text-primary"}>{ratio}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="15m" className="space-y-4">
                  <div className="p-4 bg-background/50 rounded border border-primary/30">
                    <p className="text-sm text-muted-foreground mb-3">15-Minute Decision Level - Triggers Kill-Switch at System Level</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {filteredAssets.map((asset) => {
                        const tier = asset.tier === "Tier 1" ? "Tier 1" : "Tier 2";
                        const threshold = tier === "Tier 1" ? 9.05530 : 24.23100;
                        const current = asset.volatility1h * 4.5;
                        const ratio = ((current / threshold) * 100).toFixed(0);
                        const status = current > threshold ? "KILL-SWITCH" : current > threshold * 0.8 ? "CRITICAL" : "NORMAL";
                        return (
                          <div key={asset.asset} className="p-3 bg-background/50 rounded border border-primary/10">
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-semibold text-sm">{asset.asset}</p>
                              <Badge className={status === "KILL-SWITCH" ? "bg-destructive/20 text-destructive" : status === "CRITICAL" ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}>
                                {status}
                              </Badge>
                            </div>
                            <div className="space-y-1 text-xs">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Current:</span>
                                <span className="font-mono">{current.toFixed(4)}%</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Threshold:</span>
                                <span className="font-mono">{threshold.toFixed(5)}%</span>
                              </div>
                              <div className="flex justify-between font-bold">
                                <span className="text-muted-foreground">Ratio:</span>
                                <span className={current > threshold ? "text-destructive" : "text-primary"}>{ratio}%</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                1-Hour Realized Volatility Trend
              </CardTitle>
              <CardDescription>Monitoring volatility against P99 thresholds for early warning.</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={priceVolatilityData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)" }}
                    formatter={(value: any) => `${(value as number).toFixed(2)}%`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="ETH" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="SOL" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="SUI" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Volatility Alerts */}
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Volatility Alerts & Warnings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {filteredAssets.map((asset) => {
                const volStatus = getVolatilityStatus(asset.volatility1h, asset.volatilityP99);
                const ratio = ((asset.volatility1h / asset.volatilityP99) * 100).toFixed(0);
                return (
                  <div key={asset.asset} className="p-3 border border-primary/20 rounded flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <AlertTriangle className={`w-5 h-5 ${volStatus.color}`} />
                      <div>
                        <p className="font-semibold">{asset.asset}</p>
                        <p className="text-sm text-muted-foreground">
                          {asset.volatility1h.toFixed(2)}% / {asset.volatilityP99.toFixed(2)}% P99
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-sm">{ratio}% of P99</p>
                        <Badge className={`text-xs ${volStatus.bgColor} ${volStatus.color}`}>
                          {volStatus.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="funding" className="space-y-4">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <Zap className="w-5 h-5" />
                Funding Rate Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={fundingRateData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)" }}
                    formatter={(value: any) => `${(value as number * 100).toFixed(4)}%`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="ETH" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="SOL" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="SUI" stroke="#ef4444" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Funding Rate Details */}
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Funding Rate Details (FX100 vs Binance)</CardTitle>
              <CardDescription>Compare FX100 funding rates with Binance benchmarks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredAssets.map((asset) => {
                  const fxRate = asset.fundingRateAnnualized;
                  const bnbRate = (asset as any).binanceFundingRateAnnualized;
                  const rateDiff = fxRate - bnbRate;
                  const rateDiffPct = ((rateDiff / bnbRate) * 100).toFixed(1);
                  return (
                    <div key={asset.asset} className="p-4 border border-primary/20 rounded space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="font-semibold">{asset.asset}</p>
                        <Badge className={rateDiff > 30 ? "bg-destructive/20 text-destructive" : rateDiff > 10 ? "bg-yellow-500/20 text-yellow-500" : "bg-primary/20 text-primary"}>
                          {rateDiffPct}% higher
                        </Badge>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="p-3 bg-background/50 rounded border border-primary/10">
                          <p className="text-muted-foreground text-xs font-semibold mb-2">FX100 FUNDING</p>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Current:</span>
                              <span className="font-mono text-primary">{(asset.fundingRate * 100).toFixed(4)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">APY:</span>
                              <span className="font-mono text-primary font-bold">{fxRate.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">8h Accrual:</span>
                              <span className="font-mono text-primary">{(asset.fundingRate * 8 * 100).toFixed(3)}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-background/50 rounded border border-primary/10">
                          <p className="text-muted-foreground text-xs font-semibold mb-2">BINANCE FUNDING</p>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Current:</span>
                              <span className="font-mono text-primary">{(((asset as any).binanceFundingRate) * 100).toFixed(4)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">APY:</span>
                              <span className="font-mono text-primary font-bold">{bnbRate.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">8h Accrual:</span>
                              <span className="font-mono text-primary">{(((asset as any).binanceFundingRate) * 8 * 100).toFixed(3)}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="p-3 bg-background/50 rounded border border-primary/10">
                          <p className="text-muted-foreground text-xs font-semibold mb-2">DIFFERENCE</p>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">APY Diff:</span>
                              <span className={`font-mono font-bold ${rateDiff > 0 ? "text-destructive" : "text-primary"}`}>
                                {rateDiff > 0 ? "+" : ""}{rateDiff.toFixed(1)}%
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Relative:</span>
                              <span className={`font-mono font-bold ${rateDiff > 0 ? "text-destructive" : "text-primary"}`}>
                                {rateDiff > 0 ? "+" : ""}{rateDiffPct}%
                              </span>
                            </div>
                            <div className="flex justify-between mt-2 pt-2 border-t border-primary/10">
                              <span className="text-muted-foreground">Status:</span>
                              <Badge variant="outline" className="text-xs">
                                {rateDiff > 30 ? "Premium" : rateDiff > 10 ? "Higher" : "Aligned"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="oi" className="space-y-4">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Open Interest Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={oiTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" />
                  <YAxis stroke="rgba(255,255,255,0.5)" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.2)" }}
                    formatter={(value: any) => `$${(value as number)}M`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="ETH" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="SOL" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="SUI" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* OI Distribution */}
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Open Interest Distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {filteredAssets.map((asset) => (
                <div key={asset.asset} className="p-4 border border-primary/20 rounded">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-semibold">{asset.asset}</p>
                    <p className="text-sm text-muted-foreground">${(asset.currentOI / 1000000).toFixed(0)}M OI</p>
                  </div>
                  <div className="flex gap-2 items-end h-12">
                    <div className="flex-1 bg-primary/20 rounded flex items-end justify-center" style={{ height: `${asset.topLongOI}%` }}>
                      <span className="text-xs text-primary font-bold">{asset.topLongOI}%</span>
                    </div>
                    <div className="flex-1 bg-destructive/20 rounded flex items-end justify-center" style={{ height: `${asset.topShortOI}%` }}>
                      <span className="text-xs text-destructive font-bold">{asset.topShortOI}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>Long: {asset.topLongOI}%</span>
                    <span>Short: {asset.topShortOI}%</span>
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
