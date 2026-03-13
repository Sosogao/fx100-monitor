import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, RotateCcw, ChevronRight, ChevronLeft, Search } from "lucide-react";

// Complete parameter structure with category and field names
const parameterStructure = [
  { category: "Fees", field: "OpenFeeRatio", key: "openFeeRatio", unit: "%" },
  { category: "Fees", field: "CloseFeeRatio", key: "closeFeeRatio", unit: "%" },
  { category: "Fees", field: "ConstantSpread", key: "constantSpread", unit: "" },
  { category: "Price", field: "MaxPriceDeviation", key: "maxPriceDeviation", unit: "%" },
  { category: "Price", field: "Price_Impact_Parameter_Normal", key: "priceImpactNormal", unit: "" },
  { category: "Price", field: "Price_Impact_Parameter_Emergency", key: "priceImpactEmergency", unit: "" },
  { category: "Price", field: "PI_Clamp_Min", key: "piClampMin", unit: "" },
  { category: "Price", field: "PI_Clamp_Max", key: "piClampMax", unit: "" },
  { category: "Position Limits", field: "MaxLev", key: "maxLev", unit: "x" },
  { category: "Position Limits", field: "MinPosUSD", key: "minPosUSD", unit: "$" },
  { category: "Position Limits", field: "SinglePosCap", key: "singlePosCap", unit: "%" },
  { category: "Position Limits", field: "GlobalCap", key: "globalCap", unit: "%" },
  { category: "Position Limits", field: "SinglePosCapUSD", key: "singlePosCapUSD", unit: "$" },
  { category: "Position Limits", field: "GlobalCapUSD", key: "globalCapUSD", unit: "$" },
  { category: "Cooldown", field: "OpenCoolDownPeriled(s)", key: "openCoolDown", unit: "s" },
  { category: "Risk Management", field: "ReserveFactor", key: "reserveFactor", unit: "" },
  { category: "Risk Management", field: "MinCollateralFactor", key: "minCollateralFactor", unit: "" },
  { category: "Risk Management", field: "RiskThreshold", key: "riskThreshold", unit: "" },
  { category: "Risk Management", field: "TargetRiskRatio", key: "targetRiskRatio", unit: "" },
  { category: "Funding", field: "FundingFloorAPR_Normal", key: "fundingFloorNormal", unit: "%" },
  { category: "Funding", field: "FundingBaseAPR_Normal", key: "fundingBaseNormal", unit: "%" },
  { category: "Funding", field: "FundingBaseAPR_Emergency", key: "fundingBaseEmergency", unit: "%" },
  { category: "Funding", field: "minFundingRate", key: "minFundingRate", unit: "%" },
  { category: "Funding", field: "maxFundingRate", key: "maxFundingRate", unit: "%" },
  { category: "Skew", field: "Skew EMA（Minute）", key: "skewEMA", unit: "min" },
  { category: "Skew", field: "Skew_k_normal", key: "skewKNormal", unit: "" },
  { category: "Skew", field: "Skew_k_emergency", key: "skewKEmergency", unit: "" },
  { category: "Skew", field: "Skew_Clamp_Min", key: "skewClampMin", unit: "" },
  { category: "Skew", field: "Skew_Clamp_Max", key: "skewClampMax", unit: "" },
  { category: "Orderbook Depth", field: "OrderbookDepth Long", key: "orderbookDepthLong", unit: "" },
  { category: "Orderbook Depth", field: "OrderbookDepth Short", key: "orderbookDepthShort", unit: "" },
  { category: "Orderbook Depth", field: "minOrderbookDepth Long", key: "minOrderbookDepthLong", unit: "" },
  { category: "Orderbook Depth", field: "minOrderbookDepth Short", key: "minOrderbookDepthShort", unit: "" },
  { category: "Orderbook Depth", field: "maxOrderbookDepth Long", key: "maxOrderbookDepthLong", unit: "" },
  { category: "Orderbook Depth", field: "maxOrderbookDepth Short", key: "maxOrderbookDepthShort", unit: "" },
  { category: "Grace Mechanism", field: "GraceEnabled", key: "graceEnabled", unit: "" },
  { category: "Grace Mechanism", field: "GraceBase", key: "graceBase", unit: "" },
  { category: "Grace Mechanism", field: "GraceMax", key: "graceMax", unit: "" },
  { category: "LP", field: "LP_NAV", key: "lpNav", unit: "" },
];

// Extended asset list - 50+ assets
const allAssets = [
  { asset: "BTC", tier: "Tier 1" },
  { asset: "ETH", tier: "Tier 1" },
  { asset: "XRP", tier: "Tier 1" },
  { asset: "SOL", tier: "Tier 2" },
  { asset: "SUI", tier: "Tier 2" },
  { asset: "ASTER", tier: "Tier 2" },
  { asset: "UNI", tier: "Tier 2" },
  { asset: "KAS", tier: "Tier 2" },
  { asset: "XPL", tier: "Tier 2" },
  { asset: "FARTCOIN", tier: "Tier 2" },
  { asset: "AERO", tier: "Tier 2" },
  { asset: "LINK", tier: "Tier 2" },
  { asset: "XMR", tier: "Tier 2" },
  { asset: "PENGU", tier: "Tier 2" },
  { asset: "ARB", tier: "Tier 2" },
  { asset: "SPX6900", tier: "Tier 2" },
  { asset: "DOGE", tier: "Tier 2" },
  { asset: "HYPE", tier: "Tier 2" },
  { asset: "TAO", tier: "Tier 2" },
  { asset: "KTA", tier: "Tier 2" },
  { asset: "VVV", tier: "Tier 2" },
  { asset: "WLFI", tier: "Tier 2" },
  { asset: "VIRTUAL", tier: "Tier 2" },
  { asset: "AVNT", tier: "Tier 2" },
  { asset: "CRO", tier: "Tier 2" },
  { asset: "OM", tier: "Tier 2" },
  { asset: "ICP", tier: "Tier 2" },
  { asset: "AVAX", tier: "Tier 2" },
  { asset: "ONDO", tier: "Tier 2" },
  { asset: "BRETT", tier: "Tier 2" },
  { asset: "RENDER", tier: "Tier 3" },
  { asset: "0G", tier: "Tier 3" },
  { asset: "SEI", tier: "Tier 3" },
  { asset: "LDO", tier: "Tier 3" },
  { asset: "LTC", tier: "Tier 3" },
  { asset: "GMX", tier: "Tier 3" },
  { asset: "ADA", tier: "Tier 3" },
  { asset: "AAVE", tier: "Tier 3" },
  { asset: "ZORA", tier: "Tier 3" },
  { asset: "EIGEN", tier: "Tier 3" },
  { asset: "ATOM", tier: "Tier 3" },
  { asset: "BCH", tier: "Tier 3" },
  { asset: "CRV", tier: "Tier 3" },
  { asset: "BNB", tier: "Tier 3" },
  { asset: "NEAR", tier: "Tier 3" },
  { asset: "PENDLE", tier: "Tier 3" },
  { asset: "PI", tier: "Tier 3" },
  { asset: "TRX", tier: "Tier 3" },
  { asset: "CVX", tier: "Tier 3" },
  { asset: "ZEC", tier: "Tier 3" },
];

// Mock asset data with all parameters
const assetParamsData = [
  {
    asset: "ETH",
    tier: "Tier 1",
    current: {
      openFeeRatio: 0.0002,
      closeFeeRatio: 0.0002,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.02,
      priceImpactNormal: 0.6,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 100,
      minPosUSD: 10,
      singlePosCap: 0.2,
      globalCap: 1,
      singlePosCapUSD: 6000000,
      globalCapUSD: 30000000,
      openCoolDown: 30,
      reserveFactor: 0.3,
      minCollateralFactor: 0.005,
      riskThreshold: 0.1,
      targetRiskRatio: 0.05,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.427896667,
      fundingBaseEmergency: 7.013893627,
      minFundingRate: -0.275075,
      maxFundingRate: 1.113878,
      skewEMA: 30,
      skewKNormal: 0.0025,
      skewKEmergency: 0.0125,
      skewClampMin: 0,
      skewClampMax: 0.005,
      orderbookDepthLong: 7923961.27,
      orderbookDepthShort: 7767179.17,
      minOrderbookDepthLong: 5666317.93,
      minOrderbookDepthShort: 5746868.87,
      maxOrderbookDepthLong: 11422419.53,
      maxOrderbookDepthShort: 11218985.77,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 100000000,
    },
    recommended: {
      openFeeRatio: 0.00015,
      closeFeeRatio: 0.00015,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.015,
      priceImpactNormal: 0.5,
      priceImpactEmergency: 0.9,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 100,
      minPosUSD: 10,
      singlePosCap: 0.25,
      globalCap: 1.2,
      singlePosCapUSD: 7500000,
      globalCapUSD: 36000000,
      openCoolDown: 25,
      reserveFactor: 0.25,
      minCollateralFactor: 0.005,
      riskThreshold: 0.1,
      targetRiskRatio: 0.05,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.427896667,
      fundingBaseEmergency: 7.013893627,
      minFundingRate: -0.275075,
      maxFundingRate: 1.113878,
      skewEMA: 30,
      skewKNormal: 0.0025,
      skewKEmergency: 0.0125,
      skewClampMin: 0,
      skewClampMax: 0.005,
      orderbookDepthLong: 8500000,
      orderbookDepthShort: 8500000,
      minOrderbookDepthLong: 6000000,
      minOrderbookDepthShort: 6000000,
      maxOrderbookDepthLong: 12000000,
      maxOrderbookDepthShort: 12000000,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 100000000,
    },
    template: {
      openFeeRatio: 0.0002,
      closeFeeRatio: 0.0002,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.02,
      priceImpactNormal: 0.6,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 100,
      minPosUSD: 10,
      singlePosCap: 0.2,
      globalCap: 1,
      singlePosCapUSD: 6000000,
      globalCapUSD: 30000000,
      openCoolDown: 30,
      reserveFactor: 0.3,
      minCollateralFactor: 0.005,
      riskThreshold: 0.1,
      targetRiskRatio: 0.05,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.427896667,
      fundingBaseEmergency: 7.013893627,
      minFundingRate: -0.275075,
      maxFundingRate: 1.113878,
      skewEMA: 30,
      skewKNormal: 0.0025,
      skewKEmergency: 0.0125,
      skewClampMin: 0,
      skewClampMax: 0.005,
      orderbookDepthLong: 7923961.27,
      orderbookDepthShort: 7767179.17,
      minOrderbookDepthLong: 5666317.93,
      minOrderbookDepthShort: 5746868.87,
      maxOrderbookDepthLong: 11422419.53,
      maxOrderbookDepthShort: 11218985.77,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 100000000,
    },
  },
  {
    asset: "BTC",
    tier: "Tier 1",
    current: {
      openFeeRatio: 0.0002,
      closeFeeRatio: 0.0002,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.02,
      priceImpactNormal: 0.5,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 100,
      minPosUSD: 10,
      singlePosCap: 0.2,
      globalCap: 1,
      singlePosCapUSD: 8000000,
      globalCapUSD: 40000000,
      openCoolDown: 30,
      reserveFactor: 0.4,
      minCollateralFactor: 0.004,
      riskThreshold: 0.1,
      targetRiskRatio: 0.05,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.345723333,
      fundingBaseEmergency: 6.307288511,
      minFundingRate: -0.13394,
      maxFundingRate: 0.965221,
      skewEMA: 30,
      skewKNormal: 0.01,
      skewKEmergency: 0.1,
      skewClampMin: 0,
      skewClampMax: 0.01,
      orderbookDepthLong: 15593281.79,
      orderbookDepthShort: 15217320.43,
      minOrderbookDepthLong: 12009077.44,
      minOrderbookDepthShort: 11512126.22,
      maxOrderbookDepthLong: 20884975.16,
      maxOrderbookDepthShort: 21082245.19,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 0,
    },
    recommended: {
      openFeeRatio: 0.00015,
      closeFeeRatio: 0.00015,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.015,
      priceImpactNormal: 0.5,
      priceImpactEmergency: 0.9,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 100,
      minPosUSD: 10,
      singlePosCap: 0.25,
      globalCap: 1.2,
      singlePosCapUSD: 10000000,
      globalCapUSD: 48000000,
      openCoolDown: 25,
      reserveFactor: 0.35,
      minCollateralFactor: 0.004,
      riskThreshold: 0.1,
      targetRiskRatio: 0.05,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.345723333,
      fundingBaseEmergency: 6.307288511,
      minFundingRate: -0.13394,
      maxFundingRate: 0.965221,
      skewEMA: 30,
      skewKNormal: 0.01,
      skewKEmergency: 0.1,
      skewClampMin: 0,
      skewClampMax: 0.01,
      orderbookDepthLong: 16000000,
      orderbookDepthShort: 16000000,
      minOrderbookDepthLong: 12500000,
      minOrderbookDepthShort: 12500000,
      maxOrderbookDepthLong: 21000000,
      maxOrderbookDepthShort: 21000000,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 0,
    },
    template: {
      openFeeRatio: 0.0002,
      closeFeeRatio: 0.0002,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.02,
      priceImpactNormal: 0.5,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 100,
      minPosUSD: 10,
      singlePosCap: 0.2,
      globalCap: 1,
      singlePosCapUSD: 8000000,
      globalCapUSD: 40000000,
      openCoolDown: 30,
      reserveFactor: 0.4,
      minCollateralFactor: 0.004,
      riskThreshold: 0.1,
      targetRiskRatio: 0.05,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.345723333,
      fundingBaseEmergency: 6.307288511,
      minFundingRate: -0.13394,
      maxFundingRate: 0.965221,
      skewEMA: 30,
      skewKNormal: 0.01,
      skewKEmergency: 0.1,
      skewClampMin: 0,
      skewClampMax: 0.01,
      orderbookDepthLong: 15593281.79,
      orderbookDepthShort: 15217320.43,
      minOrderbookDepthLong: 12009077.44,
      minOrderbookDepthShort: 11512126.22,
      maxOrderbookDepthLong: 20884975.16,
      maxOrderbookDepthShort: 21082245.19,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 0,
    },
  },
  {
    asset: "SOL",
    tier: "Tier 2",
    current: {
      openFeeRatio: 0.0003,
      closeFeeRatio: 0.0003,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.03,
      priceImpactNormal: 0.6,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 50,
      minPosUSD: 20,
      singlePosCap: 0.1,
      globalCap: 0.5,
      singlePosCapUSD: 2000000,
      globalCapUSD: 10000000,
      openCoolDown: 40,
      reserveFactor: 0.5,
      minCollateralFactor: 0.08,
      riskThreshold: 0.15,
      targetRiskRatio: 0.08,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.845773333,
      fundingBaseEmergency: 11.17968894,
      minFundingRate: -3.315233,
      maxFundingRate: 1.305908,
      skewEMA: 30,
      skewKNormal: 0.01,
      skewKEmergency: 0.1,
      skewClampMin: 0,
      skewClampMax: 0.01,
      orderbookDepthLong: 26636542.73,
      orderbookDepthShort: 26454213.85,
      minOrderbookDepthLong: 23263109.59,
      minOrderbookDepthShort: 21925983.47,
      maxOrderbookDepthLong: 34416319.2,
      maxOrderbookDepthShort: 33040524.14,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 0,
    },
    recommended: {
      openFeeRatio: 0.00025,
      closeFeeRatio: 0.00025,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.025,
      priceImpactNormal: 0.6,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 50,
      minPosUSD: 20,
      singlePosCap: 0.12,
      globalCap: 0.6,
      singlePosCapUSD: 2400000,
      globalCapUSD: 12000000,
      openCoolDown: 35,
      reserveFactor: 0.45,
      minCollateralFactor: 0.08,
      riskThreshold: 0.15,
      targetRiskRatio: 0.08,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.845773333,
      fundingBaseEmergency: 11.17968894,
      minFundingRate: -3.315233,
      maxFundingRate: 1.305908,
      skewEMA: 30,
      skewKNormal: 0.01,
      skewKEmergency: 0.1,
      skewClampMin: 0,
      skewClampMax: 0.01,
      orderbookDepthLong: 27000000,
      orderbookDepthShort: 27000000,
      minOrderbookDepthLong: 24000000,
      minOrderbookDepthShort: 24000000,
      maxOrderbookDepthLong: 35000000,
      maxOrderbookDepthShort: 35000000,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 0,
    },
    template: {
      openFeeRatio: 0.0003,
      closeFeeRatio: 0.0003,
      constantSpread: 0.0001,
      maxPriceDeviation: 0.03,
      priceImpactNormal: 0.6,
      priceImpactEmergency: 1,
      piClampMin: 0,
      piClampMax: 0.005,
      maxLev: 50,
      minPosUSD: 20,
      singlePosCap: 0.1,
      globalCap: 0.5,
      singlePosCapUSD: 2000000,
      globalCapUSD: 10000000,
      openCoolDown: 40,
      reserveFactor: 0.5,
      minCollateralFactor: 0.08,
      riskThreshold: 0.15,
      targetRiskRatio: 0.08,
      fundingFloorNormal: 0.1095,
      fundingBaseNormal: 1.845773333,
      fundingBaseEmergency: 11.17968894,
      minFundingRate: -3.315233,
      maxFundingRate: 1.305908,
      skewEMA: 30,
      skewKNormal: 0.01,
      skewKEmergency: 0.1,
      skewClampMin: 0,
      skewClampMax: 0.01,
      orderbookDepthLong: 26636542.73,
      orderbookDepthShort: 26454213.85,
      minOrderbookDepthLong: 23263109.59,
      minOrderbookDepthShort: 21925983.47,
      maxOrderbookDepthLong: 34416319.2,
      maxOrderbookDepthShort: 33040524.14,
      graceEnabled: true,
      graceBase: 15,
      graceMax: 120,
      lpNav: 0,
    },
  },
];

function getComparisonColor(current: any, recommended: any) {
  if (typeof current === "number" && typeof recommended === "number") {
    const diff = Math.abs(recommended - current);
    const pct = Math.abs(current) > 0 ? (diff / Math.abs(current)) * 100 : 0;
    if (pct < 5) return "text-primary";
    if (pct < 15) return "text-yellow-500";
    return "text-destructive";
  }
  return "text-muted-foreground";
}

function formatValue(val: any) {
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") {
    if (val > 1000000) return (val / 1000000).toFixed(2) + "M";
    if (val > 1000) return (val / 1000).toFixed(2) + "K";
    return val.toFixed(4);
  }
  return String(val);
}

export default function ParametersEnhanced() {
  const [selectedAsset, setSelectedAsset] = useState(assetParamsData[0]);
  const [activeTab, setActiveTab] = useState("comparison");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [assetSearch, setAssetSearch] = useState("");

  const categories = useMemo(() => Array.from(new Set(parameterStructure.map((p) => p.category))), []);

  const filteredAssets = useMemo(() => {
    return allAssets.filter((a) => a.asset.toLowerCase().includes(assetSearch.toLowerCase()));
  }, [assetSearch]);

  const filteredParameters = useMemo(() => {
    return parameterStructure.filter((p) => {
      const matchesSearch = p.field.toLowerCase().includes(searchTerm.toLowerCase()) || p.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = !selectedCategory || p.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchTerm, selectedCategory]);

  const handleScroll = (direction: "left" | "right") => {
    const container = document.getElementById("param-table-scroll");
    if (container) {
      const scrollAmount = 400;
      container.scrollLeft += direction === "right" ? scrollAmount : -scrollAmount;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-primary uppercase">Risk Parameters</h2>
          <p className="text-muted-foreground">Comprehensive parameter comparison: Current vs Recommended vs Tier Template (D-AQ columns)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="border-primary/50 text-primary hover:bg-primary/10">
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset All
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Save className="w-4 h-4 mr-2" />
            Apply Changes
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-primary/20">
          <TabsTrigger value="comparison" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Parameter Comparison
          </TabsTrigger>
          <TabsTrigger value="categories" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            By Category
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            Tier Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="comparison" className="space-y-4">
          {/* Asset Selector with Dropdown */}
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Select Asset</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedAsset.asset} onValueChange={(value) => {
                const asset = assetParamsData.find((a) => a.asset === value);
                if (asset) setSelectedAsset(asset);
              }}>
                <SelectTrigger className="w-full bg-background/50 border-primary/20 text-primary">
                  <SelectValue placeholder="Select an asset..." />
                </SelectTrigger>
                <SelectContent className="bg-background border-primary/20">
                  {filteredAssets.map((asset) => {
                    const hasData = assetParamsData.some((a) => a.asset === asset.asset);
                    return (
                      <SelectItem key={asset.asset} value={asset.asset} disabled={!hasData}>
                        <span className="text-primary">
                          {asset.asset}
                          <Badge className="ml-2 bg-primary/20 text-primary text-xs">{asset.tier}</Badge>
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="mt-4 text-sm text-muted-foreground">
                <p>Selected: <span className="text-primary font-bold">{selectedAsset.asset}</span> ({selectedAsset.tier})</p>
              </div>
            </CardContent>
          </Card>

          {/* Search and Filter */}
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary text-lg">Search & Filter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-primary/50" />
                <Input
                  placeholder="Search parameters..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 bg-background/50 border-primary/20 text-primary placeholder:text-primary/30"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedCategory === null ? "default" : "outline"}
                  onClick={() => setSelectedCategory(null)}
                  className={selectedCategory === null ? "bg-primary text-primary-foreground" : "border-primary/20 text-primary"}
                >
                  All Categories
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat}
                    size="sm"
                    variant={selectedCategory === cat ? "default" : "outline"}
                    onClick={() => setSelectedCategory(cat)}
                    className={selectedCategory === cat ? "bg-primary text-primary-foreground" : "border-primary/20 text-primary"}
                  >
                    {cat}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Parameter Comparison Table */}
          <Card className="bg-card/50 border-primary/20 tech-border overflow-hidden">
            <CardHeader>
              <CardTitle className="text-primary flex items-center justify-between">
                <span>Full Parameter Comparison</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => handleScroll("left")} className="text-primary hover:bg-primary/20">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleScroll("right")} className="text-primary hover:bg-primary/20">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>Showing {filteredParameters.length} parameters</CardDescription>
            </CardHeader>
            <CardContent>
              <div id="param-table-scroll" className="overflow-x-auto pb-4">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b-2 border-primary/30">
                      <th colSpan={5} className="text-left px-4 py-2 text-primary font-bold text-center bg-primary/5">
                        Parameter Details
                      </th>
                    </tr>
                    <tr className="border-b border-primary/20">
                      <th className="sticky left-0 bg-background/80 backdrop-blur z-10 text-left px-4 py-2 text-primary font-bold min-w-[200px]">
                        <div className="text-xs text-muted-foreground">Category</div>
                        <div>Field Name</div>
                      </th>
                      <th className="px-4 py-2 text-primary font-bold text-center min-w-[140px]">
                        <div className="text-xs text-muted-foreground">Current</div>
                        <div>Value</div>
                      </th>
                      <th className="px-4 py-2 text-primary font-bold text-center min-w-[140px]">
                        <div className="text-xs text-muted-foreground">Recommended</div>
                        <div>Value</div>
                      </th>
                      <th className="px-4 py-2 text-primary font-bold text-center min-w-[140px]">
                        <div className="text-xs text-muted-foreground">Tier Template</div>
                        <div>Value</div>
                      </th>
                      <th className="px-4 py-2 text-primary font-bold text-center min-w-[100px]">
                        <div className="text-xs text-muted-foreground">Status</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredParameters.map((param) => {
                      const current = selectedAsset.current[param.key as keyof typeof selectedAsset.current];
                      const recommended = selectedAsset.recommended[param.key as keyof typeof selectedAsset.recommended];
                      const template = selectedAsset.template[param.key as keyof typeof selectedAsset.template];

                      return (
                        <tr key={param.key} className="border-b border-primary/10 hover:bg-primary/5">
                          <td className="sticky left-0 bg-background/50 backdrop-blur z-10 px-4 py-3 text-primary font-semibold">
                            <div className="text-xs text-muted-foreground">{param.category}</div>
                            <div className="font-mono text-sm">{param.field}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-primary font-mono">
                            {formatValue(current)}
                            {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                          </td>
                          <td className={`px-4 py-3 text-center font-mono ${getComparisonColor(current, recommended)}`}>
                            {formatValue(recommended)}
                            {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-primary font-mono">
                            {formatValue(template)}
                            {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              className={
                                JSON.stringify(current) === JSON.stringify(recommended)
                                  ? "bg-primary/20 text-primary"
                                  : "bg-yellow-500/20 text-yellow-500"
                              }
                            >
                              {JSON.stringify(current) === JSON.stringify(recommended) ? "✓" : "⚠"}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          {categories.map((category) => (
            <Card key={category} className="bg-card/50 border-primary/20 tech-border">
              <CardHeader>
                <CardTitle className="text-primary">{category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {parameterStructure
                    .filter((p) => p.category === category)
                    .map((param) => {
                      const current = selectedAsset.current[param.key as keyof typeof selectedAsset.current];
                      const recommended = selectedAsset.recommended[param.key as keyof typeof selectedAsset.recommended];

                      return (
                        <div key={param.key} className="p-3 bg-background/50 rounded border border-primary/10">
                          <p className="text-sm text-muted-foreground">{param.field}</p>
                          <div className="flex items-center justify-between mt-2">
                            <div>
                              <p className="text-lg font-bold text-primary">
                                {formatValue(current)}
                                {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                              </p>
                            </div>
                            <Badge className={getComparisonColor(current, recommended)}>
                              {formatValue(recommended)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <Card className="bg-card/50 border-primary/20 tech-border">
            <CardHeader>
              <CardTitle className="text-primary">Tier-Based Templates</CardTitle>
              <CardDescription>Complete template parameters for each asset tier - Compare side by side</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="tier1" className="space-y-4">
                <TabsList className="bg-card/50 border border-primary/20 w-full">
                  <TabsTrigger value="tier1" className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    Tier 1 Template
                  </TabsTrigger>
                  <TabsTrigger value="tier2" className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    Tier 2 Template
                  </TabsTrigger>
                  <TabsTrigger value="comparison" className="flex-1 data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    Side-by-Side
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="tier1" className="space-y-4">
                  <div className="p-4 bg-background/50 rounded border border-primary/10">
                    <h3 className="text-primary font-bold mb-4">Tier 1 Template (ETH, BTC)</h3>
                    <div className="overflow-x-auto pb-4">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-primary/20">
                            <th className="sticky left-0 bg-background/80 z-10 text-left px-3 py-2 text-primary font-bold min-w-[180px]">
                              Parameter
                            </th>
                            <th className="px-3 py-2 text-primary font-bold text-center min-w-[120px]">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parameterStructure.map((param) => {
                            const tierAsset = assetParamsData.find((a) => a.tier === "Tier 1");
                            const value = tierAsset?.template[param.key as keyof typeof tierAsset.template];
                            return (
                              <tr key={param.key} className="border-b border-primary/10 hover:bg-primary/5">
                                <td className="sticky left-0 bg-background/50 z-10 px-3 py-2 text-primary font-semibold">
                                  <div className="text-xs text-muted-foreground">{param.category}</div>
                                  <div className="font-mono text-xs">{param.field}</div>
                                </td>
                                <td className="px-3 py-2 text-center text-primary font-mono">
                                  {formatValue(value)}
                                  {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="tier2" className="space-y-4">
                  <div className="p-4 bg-background/50 rounded border border-primary/10">
                    <h3 className="text-primary font-bold mb-4">Tier 2 Template (SOL, SUI, etc.)</h3>
                    <div className="overflow-x-auto pb-4">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-primary/20">
                            <th className="sticky left-0 bg-background/80 z-10 text-left px-3 py-2 text-primary font-bold min-w-[180px]">
                              Parameter
                            </th>
                            <th className="px-3 py-2 text-primary font-bold text-center min-w-[120px]">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parameterStructure.map((param) => {
                            const tierAsset = assetParamsData.find((a) => a.tier === "Tier 2");
                            const value = tierAsset?.template[param.key as keyof typeof tierAsset.template];
                            return (
                              <tr key={param.key} className="border-b border-primary/10 hover:bg-primary/5">
                                <td className="sticky left-0 bg-background/50 z-10 px-3 py-2 text-primary font-semibold">
                                  <div className="text-xs text-muted-foreground">{param.category}</div>
                                  <div className="font-mono text-xs">{param.field}</div>
                                </td>
                                <td className="px-3 py-2 text-center text-primary font-mono">
                                  {formatValue(value)}
                                  {param.unit && <span className="text-xs text-muted-foreground ml-1">{param.unit}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="comparison" className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="p-4 bg-background/50 rounded border border-primary/10">
                      <h3 className="text-primary font-bold mb-4">Tier 1 Template</h3>
                      <div className="overflow-x-auto pb-4">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-primary/20">
                              <th className="text-left px-2 py-2 text-primary font-bold min-w-[120px]">Parameter</th>
                              <th className="px-2 py-2 text-primary font-bold text-center min-w-[80px]">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parameterStructure.map((param) => {
                              const tierAsset = assetParamsData.find((a) => a.tier === "Tier 1");
                              const value = tierAsset?.template[param.key as keyof typeof tierAsset.template];
                              return (
                                <tr key={param.key} className="border-b border-primary/10 hover:bg-primary/5">
                                  <td className="px-2 py-2 text-primary font-semibold text-xs">{param.field}</td>
                                  <td className="px-2 py-2 text-center text-primary font-mono text-xs">
                                    {formatValue(value)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="p-4 bg-background/50 rounded border border-primary/10">
                      <h3 className="text-primary font-bold mb-4">Tier 2 Template</h3>
                      <div className="overflow-x-auto pb-4">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-primary/20">
                              <th className="text-left px-2 py-2 text-primary font-bold min-w-[120px]">Parameter</th>
                              <th className="px-2 py-2 text-primary font-bold text-center min-w-[80px]">Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parameterStructure.map((param) => {
                              const tierAsset = assetParamsData.find((a) => a.tier === "Tier 2");
                              const value = tierAsset?.template[param.key as keyof typeof tierAsset.template];
                              return (
                                <tr key={param.key} className="border-b border-primary/10 hover:bg-primary/5">
                                  <td className="px-2 py-2 text-primary font-semibold text-xs">{param.field}</td>
                                  <td className="px-2 py-2 text-center text-primary font-mono text-xs">
                                    {formatValue(value)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
