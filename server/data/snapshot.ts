import fs from "node:fs/promises";
import path from "node:path";
import { AbiCoder, Contract, Interface, JsonRpcProvider, ZeroAddress, formatUnits, getAddress, keccak256, toBeHex } from "ethers";
import type {
  ActionRecord,
  AlertLevel,
  AlertRecord,
  DashboardNote,
  DashboardOverview,
  DashboardStat,
  EnvironmentInfo,
  MarketSeries,
  MarketSnapshot,
  MetricPoint,
  MonitoringSnapshot,
  ParameterFieldDefinition,
  ParameterSnapshot,
  ParameterSourceSet,
  ParameterValueSet,
  RecoveryRecord,
} from "../../shared/monitoring";
import { basefx100Sepolia0312 } from "../config/fx100";

const projectRoot = process.cwd();

const abiCoder = AbiCoder.defaultAbiCoder();
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const FACTOR_DECIMALS = 30;
const USD_DECIMALS = 30;

const DATA_STORE_ABI = [
  "function getUint(bytes32 key) view returns (uint256)",
  "function getInt(bytes32 key) view returns (int256)",
  "function getBytes32(bytes32 key) view returns (bytes32)",
  "function getAddress(bytes32 key) view returns (address)",
  "function getUintCount(bytes32 setKey) view returns (uint256)",
  "function getUintValuesAt(bytes32 setKey, uint256 start, uint256 end) view returns (uint256[])",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ORACLE_ABI = [
  "function getPrimaryPrice(address token) view returns ((uint256 min,uint256 max))",
];

const dataStoreInterface = new Interface(DATA_STORE_ABI);

const DATA_KEYS = {
  MARKET_LIST: keyFromString("MARKET_LIST"),
  POSITION_FEE_FACTOR: keyFromString("POSITION_FEE_FACTOR"),
  PRICE_IMPACT_PARAMETER: keyFromString("PRICE_IMPACT_PARAMETER"),
  BID_ORDER_BOOK_DEPTH: keyFromString("BID_ORDER_BOOK_DEPTH"),
  ASK_ORDER_BOOK_DEPTH: keyFromString("ASK_ORDER_BOOK_DEPTH"),
  OPEN_INTEREST_IN_TOKENS: keyFromString("OPEN_INTEREST_IN_TOKENS"),
  POOL_AMOUNT: keyFromString("POOL_AMOUNT"),
  MAX_OPEN_INTEREST: keyFromString("MAX_OPEN_INTEREST"),
  NEGATIVE_FUNDING_FEE_PER_SIZE: keyFromString("NEGATIVE_FUNDING_FEE_PER_SIZE"),
  POSITIVE_FUNDING_FEE_PER_SIZE: keyFromString("POSITIVE_FUNDING_FEE_PER_SIZE"),
  FUNDING_SKEW_EMA: keyFromString("FUNDING_SKEW_EMA"),
  FUNDING_FLOOR_FACTOR: keyFromString("FUNDING_FLOOR_FACTOR"),
  FUNDING_BASE_FACTOR: keyFromString("FUNDING_BASE_FACTOR"),
  MIN_FUNDING_FACTOR_PER_SECOND: keyFromString("MIN_FUNDING_FACTOR_PER_SECOND"),
  MAX_FUNDING_FACTOR_PER_SECOND: keyFromString("MAX_FUNDING_FACTOR_PER_SECOND"),
  FUNDING_UPDATED_AT: keyFromString("FUNDING_UPDATED_AT"),
  MIN_COLLATERAL_FACTOR: keyFromString("MIN_COLLATERAL_FACTOR"),
  MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION: keyFromString("MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION"),
  MAX_POSITION_SIZE_USD: keyFromString("MAX_POSITION_SIZE_USD"),
};

const MARKET_PROP_KEYS = {
  VAULT: keyFromString("VAULT"),
  INDEX_TOKEN: keyFromString("INDEX_TOKEN"),
  COLLATERAL_TOKEN: keyFromString("COLLATERAL_TOKEN"),
};

interface AssetSeed {
  referencePriceUsd: number;
}

interface OnchainMarketState {
  symbol: string;
  displayName: string;
  tier: string;
  marketIndex: number;
  vault: string;
  indexToken: string;
  collateralToken: string;
  collateralTokenDecimals: number;
  indexTokenDecimals: number;
  collateralVaultBalance: number;
  indexVaultBalance: number;
  poolCollateralAmount: number;
  positionFeeFactorPct: number;
  priceImpactParameter: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  minCollateralFactorPct: number;
  minCollateralFactorForLiquidationPct: number;
  maxPositionSizeUsd: number;
  fundingSkewEmaMinutes: number;
  fundingSkewEmaPct: number;
  fundingSkewSampleIntervalMinutes: number;
  fundingFloorAprPct: number;
  fundingBaseAprPct: number;
  minFundingAprPct: number;
  maxFundingAprPct: number;
  fundingUpdatedAt?: number;
  fundingUpdatedAgoMinutes?: number;
  longNegativeFundingFeePerSizePct: number;
  longPositiveFundingFeePerSizePct: number;
  shortNegativeFundingFeePerSizePct: number;
  shortPositiveFundingFeePerSizePct: number;
  oraclePriceUsd?: number;
  longOiTokens: number;
  shortOiTokens: number;
  maxOpenInterestLongUsd: number;
  maxOpenInterestShortUsd: number;
}

interface ExternalVenueMarketState {
  symbol: string;
  referencePriceUsd?: number;
  indexPriceUsd?: number;
  spotPriceUsd?: number;
  markPriceUsd?: number;
  fundingAprPct?: number;
  source?: "live-aggregate" | "live-index" | "live-spot" | "live-mark";
}

interface LiveReadState {
  chainId?: number;
  blockNumber?: number;
  blockTimestamp?: number;
  lpVaultUsdcBalance?: number;
  readStatus: EnvironmentInfo["readStatus"];
  onchainMarkets: OnchainMarketState[];
  externalVenueMarkets: Record<string, ExternalVenueMarketState>;
}

const assetSeeds: Record<string, AssetSeed> = {
  ETH: { referencePriceUsd: 4425 },
  BTC: { referencePriceUsd: 84210 },
};


const parameterDefinitions: ParameterFieldDefinition[] = [
  { category: "Fees", label: "Open Fee Ratio", key: "openFeeRatio", unit: "%" },
  { category: "Fees", label: "Close Fee Ratio", key: "closeFeeRatio", unit: "%" },
  { category: "Fees", label: "Constant Spread", key: "constantSpread", unit: "%" },
  { category: "Price", label: "Max Price Deviation", key: "maxPriceDeviation", unit: "%" },
  { category: "Price", label: "Price Impact Normal", key: "priceImpactNormal", unit: "x" },
  { category: "Price", label: "Price Impact Emergency", key: "priceImpactEmergency", unit: "x" },
  { category: "Price", label: "PI Clamp Min", key: "piClampMin", unit: "%" },
  { category: "Price", label: "PI Clamp Max", key: "piClampMax", unit: "%" },
  { category: "Position Limits", label: "Max Leverage", key: "maxLev", unit: "x" },
  { category: "Position Limits", label: "Min Position USD", key: "minPosUsd", unit: "$" },
  { category: "Position Limits", label: "Single Position Cap", key: "singlePosCap", unit: "%" },
  { category: "Position Limits", label: "Global Cap", key: "globalCap", unit: "%" },
  { category: "Position Limits", label: "Single Position Cap USD", key: "singlePosCapUsd", unit: "$" },
  { category: "Position Limits", label: "Global Cap USD", key: "globalCapUsd", unit: "$" },
  { category: "Cooldown", label: "Open Cooldown", key: "openCooldownSec", unit: "s" },
  { category: "Risk", label: "Reserve Factor", key: "reserveFactor", unit: "%" },
  { category: "Risk", label: "Min Collateral Factor", key: "minCollateralFactor", unit: "%" },
  { category: "Risk", label: "Risk Threshold", key: "riskThreshold", unit: "%" },
  { category: "Risk", label: "Target Risk Ratio", key: "targetRiskRatio", unit: "%" },
  { category: "Funding", label: "Funding Floor APR", key: "fundingFloorApr", unit: "%" },
  { category: "Funding", label: "Funding Base APR", key: "fundingBaseApr", unit: "%" },
  { category: "Funding", label: "Funding Emergency APR", key: "fundingEmergencyApr", unit: "%" },
  { category: "Funding", label: "Min Funding Rate", key: "minFundingRate", unit: "%" },
  { category: "Funding", label: "Max Funding Rate", key: "maxFundingRate", unit: "%" },
  { category: "Skew", label: "Skew EMA", key: "skewEmaMinutes", unit: "min" },
  { category: "Skew", label: "Skew K Normal", key: "skewKNormal", unit: "x" },
  { category: "Skew", label: "Skew K Emergency", key: "skewKEmergency", unit: "x" },
  { category: "Skew", label: "Skew Clamp Min", key: "skewClampMin", unit: "%" },
  { category: "Skew", label: "Skew Clamp Max", key: "skewClampMax", unit: "%" },
  { category: "Orderbook", label: "Orderbook Depth Long", key: "orderbookDepthLong", unit: "$" },
  { category: "Orderbook", label: "Orderbook Depth Short", key: "orderbookDepthShort", unit: "$" },
  { category: "Orderbook", label: "Min Orderbook Depth Long", key: "minOrderbookDepthLong", unit: "$" },
  { category: "Orderbook", label: "Min Orderbook Depth Short", key: "minOrderbookDepthShort", unit: "$" },
  { category: "Orderbook", label: "Max Orderbook Depth Long", key: "maxOrderbookDepthLong", unit: "$" },
  { category: "Orderbook", label: "Max Orderbook Depth Short", key: "maxOrderbookDepthShort", unit: "$" },
  { category: "Grace", label: "Grace Enabled", key: "graceEnabled", unit: "" },
  { category: "Grace", label: "Grace Base", key: "graceBaseMinutes", unit: "min" },
  { category: "Grace", label: "Grace Max", key: "graceMaxMinutes", unit: "min" },
  { category: "LP", label: "LP NAV", key: "lpNavUsd", unit: "$" },
];

const tierTemplates: Record<string, ParameterValueSet> = {
  "Tier 1": {
    openFeeRatio: 0.02,
    closeFeeRatio: 0.02,
    constantSpread: 0.01,
    maxPriceDeviation: 1.5,
    priceImpactNormal: 0.8,
    priceImpactEmergency: 1.1,
    piClampMin: 0,
    piClampMax: 0.5,
    maxLev: 100,
    minPosUsd: 10,
    singlePosCap: 22,
    globalCap: 100,
    singlePosCapUsd: 8_000_000,
    globalCapUsd: 40_000_000,
    openCooldownSec: 20,
    reserveFactor: 25,
    minCollateralFactor: 0.5,
    riskThreshold: 10,
    targetRiskRatio: 5,
    fundingFloorApr: 10.95,
    fundingBaseApr: 28,
    fundingEmergencyApr: 84,
    minFundingRate: -12,
    maxFundingRate: 140,
    skewEmaMinutes: 20,
    skewKNormal: 0.25,
    skewKEmergency: 0.9,
    skewClampMin: 0,
    skewClampMax: 0.5,
    orderbookDepthLong: 10_000_000,
    orderbookDepthShort: 10_000_000,
    minOrderbookDepthLong: 7_000_000,
    minOrderbookDepthShort: 7_000_000,
    maxOrderbookDepthLong: 14_000_000,
    maxOrderbookDepthShort: 14_000_000,
    graceEnabled: true,
    graceBaseMinutes: 15,
    graceMaxMinutes: 120,
    lpNavUsd: 125_000_000,
  },
  "Tier 2": {
    openFeeRatio: 0.03,
    closeFeeRatio: 0.03,
    constantSpread: 0.015,
    maxPriceDeviation: 2,
    priceImpactNormal: 1,
    priceImpactEmergency: 1.4,
    piClampMin: 0,
    piClampMax: 0.75,
    maxLev: 75,
    minPosUsd: 15,
    singlePosCap: 18,
    globalCap: 85,
    singlePosCapUsd: 5_000_000,
    globalCapUsd: 24_000_000,
    openCooldownSec: 30,
    reserveFactor: 30,
    minCollateralFactor: 0.8,
    riskThreshold: 12,
    targetRiskRatio: 6,
    fundingFloorApr: 12.5,
    fundingBaseApr: 36,
    fundingEmergencyApr: 96,
    minFundingRate: -16,
    maxFundingRate: 180,
    skewEmaMinutes: 30,
    skewKNormal: 0.35,
    skewKEmergency: 1.2,
    skewClampMin: 0,
    skewClampMax: 1,
    orderbookDepthLong: 6_000_000,
    orderbookDepthShort: 6_000_000,
    minOrderbookDepthLong: 4_000_000,
    minOrderbookDepthShort: 4_000_000,
    maxOrderbookDepthLong: 9_000_000,
    maxOrderbookDepthShort: 9_000_000,
    graceEnabled: true,
    graceBaseMinutes: 20,
    graceMaxMinutes: 180,
    lpNavUsd: 96_000_000,
  },
  "Tier 3": {
    openFeeRatio: 0.04,
    closeFeeRatio: 0.04,
    constantSpread: 0.02,
    maxPriceDeviation: 2.5,
    priceImpactNormal: 1.2,
    priceImpactEmergency: 1.8,
    piClampMin: 0,
    piClampMax: 1.25,
    maxLev: 50,
    minPosUsd: 20,
    singlePosCap: 12,
    globalCap: 60,
    singlePosCapUsd: 2_500_000,
    globalCapUsd: 12_000_000,
    openCooldownSec: 45,
    reserveFactor: 35,
    minCollateralFactor: 1,
    riskThreshold: 15,
    targetRiskRatio: 8,
    fundingFloorApr: 16,
    fundingBaseApr: 48,
    fundingEmergencyApr: 140,
    minFundingRate: -18,
    maxFundingRate: 240,
    skewEmaMinutes: 40,
    skewKNormal: 0.5,
    skewKEmergency: 1.6,
    skewClampMin: 0,
    skewClampMax: 1.5,
    orderbookDepthLong: 3_500_000,
    orderbookDepthShort: 3_500_000,
    minOrderbookDepthLong: 2_000_000,
    minOrderbookDepthShort: 2_000_000,
    maxOrderbookDepthLong: 5_500_000,
    maxOrderbookDepthShort: 5_500_000,
    graceEnabled: true,
    graceBaseMinutes: 30,
    graceMaxMinutes: 240,
    lpNavUsd: 72_000_000,
  },
};

function keyFromString(value: string): string {
  return keccak256(abiCoder.encode(["string"], [value]));
}

function hashKey(types: string[], values: unknown[]): string {
  return keccak256(abiCoder.encode(types, values));
}

function marketPropKey(marketIndex: number, propKey: string): string {
  return hashKey(["bytes32", "bytes32"], [toBeHex(marketIndex, 32), propKey]);
}

function marketUintKey(baseKey: string, marketIndex: number): string {
  return hashKey(["bytes32", "uint256"], [baseKey, BigInt(marketIndex)]);
}

function marketBoolKey(baseKey: string, marketIndex: number, isLong: boolean): string {
  return hashKey(["bytes32", "uint256", "bool"], [baseKey, BigInt(marketIndex), isLong]);
}

function marketAddressKey(baseKey: string, marketIndex: number, token: string): string {
  return hashKey(["bytes32", "uint256", "address"], [baseKey, BigInt(marketIndex), getAddress(token)]);
}

async function fetchJson<T>(url: string): Promise<T | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return undefined;
    return (await response.json()) as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function loadExternalVenueMarkets(): Promise<Record<string, ExternalVenueMarketState>> {
  const venue = basefx100Sepolia0312.externalVenue;
  const entries = await Promise.all(
    venue.markets.map(async (market) => {
      const [premium, spot] = await Promise.all([
        fetchJson<{ markPrice?: string; indexPrice?: string; lastFundingRate?: string }>(
          `${venue.restBaseUrl}/fapi/v1/premiumIndex?symbol=${market.perpSymbol}`,
        ),
        fetchJson<{ price?: string }>(`https://api.binance.com/api/v3/ticker/price?symbol=${market.spotSymbol}`),
      ]);
      const markPriceUsd = premium?.markPrice ? Number(premium.markPrice) : undefined;
      const indexPriceUsd = premium?.indexPrice ? Number(premium.indexPrice) : undefined;
      const spotPriceUsd = spot?.price ? Number(spot.price) : undefined;
      const fundingAprPct = premium?.lastFundingRate ? round(Number(premium.lastFundingRate) * 3 * 365 * 100, 2) : undefined;
      const livePrices = [indexPriceUsd, spotPriceUsd, markPriceUsd].filter((value): value is number => value !== undefined);
      const referencePriceUsd = livePrices.length >= 2 ? median(livePrices) : (indexPriceUsd ?? spotPriceUsd ?? markPriceUsd);
      const source = livePrices.length >= 2
        ? "live-aggregate"
        : indexPriceUsd !== undefined
          ? "live-index"
          : spotPriceUsd !== undefined
            ? "live-spot"
            : markPriceUsd !== undefined
              ? "live-mark"
              : undefined;
      return [market.symbol, {
        symbol: market.symbol,
        referencePriceUsd,
        indexPriceUsd,
        spotPriceUsd,
        markPriceUsd,
        fundingAprPct,
        source,
      } satisfies ExternalVenueMarketState] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function deriveFundingBenchmarkAprPct(
  fundingBaseAprPct: number,
  fundingFloorAprPct: number,
  minFundingAprPct: number,
  maxFundingAprPct: number,
  skewPct: number,
  utilizationPct: number,
): number {
  const base = fundingFloorAprPct + (Math.abs(skewPct) * 0.08) + (utilizationPct * 0.05);
  const lower = minFundingAprPct !== 0 ? minFundingAprPct : fundingFloorAprPct;
  const upper = maxFundingAprPct !== 0 ? maxFundingAprPct : Math.max(fundingBaseAprPct, fundingFloorAprPct);
  return round(clamp(base, lower, upper), 2);
}

function deriveOiChange24hPct(utilizationPct: number, skewPct: number, fundingGapPct: number): number {
  return round(clamp((utilizationPct * 0.18) + (Math.abs(skewPct) * 0.12) + (fundingGapPct * 0.45) - 4, -25, 25), 2);
}

function buildRuntimeSeries(current: number, points: number, amplitudePct: number, driftPct: number): MetricPoint[] {
  return Array.from({ length: points }).map((_, index) => {
    const progress = points === 1 ? 1 : index / (points - 1);
    const wave = Math.sin(index * 1.35) * amplitudePct * 0.01;
    const trend = (progress - 0.5) * driftPct * 0.01;
    const value = current * (1 + wave - trend);
    return {
      time: `${String(index * 4).padStart(2, "0")}:00`,
      value: Number(value.toFixed(2)),
    };
  });
}

function runtimeTierBaseVarPct(tier: string): number {
  if (tier === "Tier 1") return 3.2;
  if (tier === "Tier 2") return 5.4;
  return 8.5;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function deriveRuntimeAnalytics(inputs: {
  tier: string;
  oraclePriceUsd: number;
  configuredReferencePriceUsd?: number;
  fundingBaseAprPct: number;
  fundingFloorAprPct: number;
  minFundingAprPct: number;
  maxFundingAprPct: number;
  skewPct: number;
  utilizationPct: number;
  poolStressPct: number;
  hasLiveOi: boolean;
  hasRuntimeProtocolSignal: boolean;
}): {
  source: "runtime-derived" | "seeded-fallback";
  riskScore: number;
  alertLevel: AlertLevel;
  var99_9Pct: number;
  es99_9Pct: number;
  tailRatio: number;
  realizedVol1hPct: number;
  volLimitPct: number;
} {
  const fundingBenchmarkAprPct = deriveFundingBenchmarkAprPct(
    inputs.fundingBaseAprPct,
    inputs.fundingFloorAprPct,
    inputs.minFundingAprPct,
    inputs.maxFundingAprPct,
    inputs.skewPct,
    inputs.utilizationPct,
  );
  const fundingGapPct = Math.abs(inputs.fundingBaseAprPct - fundingBenchmarkAprPct);
  const deviationPct = inputs.oraclePriceUsd > 0 && inputs.configuredReferencePriceUsd
    ? Math.abs((inputs.configuredReferencePriceUsd - inputs.oraclePriceUsd) / inputs.oraclePriceUsd) * 100
    : 0;
  const baseVarPct = runtimeTierBaseVarPct(inputs.tier);
  const var99_9Pct = round(baseVarPct + inputs.skewPct * 0.08 + fundingGapPct * 0.18 + inputs.utilizationPct * 0.035 + inputs.poolStressPct * 0.025 + deviationPct * 0.25, 2);
  const tailRatio = round(clamp(1.08 + inputs.skewPct / 200 + inputs.utilizationPct / 500 + fundingGapPct / 120, 1.05, 1.8), 3);
  const es99_9Pct = round(var99_9Pct * tailRatio, 2);
  const realizedVol1hPct = round(clamp(var99_9Pct * 0.68 + inputs.skewPct * 0.03 + fundingGapPct * 0.04, 0.5, es99_9Pct), 2);
  const volLimitPct = round(var99_9Pct * 1.35, 2);
  const scoreRaw =
    (var99_9Pct / 2.4) * 0.34 +
    (es99_9Pct / 3.1) * 0.24 +
    (fundingGapPct / 3.5) * 0.14 +
    (inputs.skewPct / 18) * 0.12 +
    (inputs.utilizationPct / 55) * 0.10 +
    (inputs.poolStressPct / 65) * 0.06;
  const riskScore = round(clamp(scoreRaw, 0, 10), 2);

  let alertLevel: AlertLevel = "normal";
  if (inputs.poolStressPct >= 90 || inputs.utilizationPct >= 85 || riskScore >= 8.2) {
    alertLevel = "l3";
  } else if (inputs.poolStressPct >= 75 || inputs.utilizationPct >= 65 || fundingGapPct >= 8 || riskScore >= 6.2) {
    alertLevel = "l2";
  } else if (fundingGapPct >= 4 || inputs.skewPct >= 18 || riskScore >= 4.2) {
    alertLevel = "l1";
  }

  return {
    source: inputs.hasLiveOi || inputs.hasRuntimeProtocolSignal ? "runtime-derived" : "seeded-fallback",
    riskScore,
    alertLevel,
    var99_9Pct,
    es99_9Pct,
    tailRatio,
    realizedVol1hPct,
    volLimitPct,
  };
}

function normalizeAlertLevel(value: string): AlertLevel {
  if (value.startsWith("L3")) return "l3";
  if (value.startsWith("L2")) return "l2";
  if (value.startsWith("L1")) return "l1";
  return "normal";
}

function watchStatusFromAlert(level: AlertLevel): string {
  switch (level) {
    case "l3":
      return "Emergency";
    case "l2":
      return "High Stress";
    case "l1":
      return "Elevated";
    default:
      return "Normal";
  }
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function displayFromSymbol(symbol: string): string {
  return symbol === "ETH" ? "ETH-USD" : symbol === "BTC" ? "WBTC-USD" : `${symbol}-USD`;
}

function symbolFromMarket(indexToken: string, marketIndex: number): string {
  const token = getAddress(indexToken);
  if (token === getAddress(basefx100Sepolia0312.tokens.WETH)) return "ETH";
  if (token === getAddress(basefx100Sepolia0312.tokens.WBTC)) return "BTC";
  const configured = basefx100Sepolia0312.markets.find((market) => market.marketIndex == marketIndex || getAddress(market.indexToken) === token);
  return configured?.symbol ?? `M${marketIndex}`;
}

function inferTokenDecimals(symbol: string, token: string): number {
  const normalized = getAddress(token);
  if (normalized === getAddress(basefx100Sepolia0312.tokens.CORE_USDC)) return 6;
  if (normalized === getAddress(basefx100Sepolia0312.tokens.WBTC) || symbol === "BTC") return 8;
  return 18;
}

function factorToPercent(raw: bigint): number {
  return round(Number(formatUnits(raw, FACTOR_DECIMALS)) * 100, 4);
}

function factorToRatio(raw: bigint): number {
  return round(Number(formatUnits(raw, FACTOR_DECIMALS)), 6);
}

function usdValue(raw: bigint): number {
  return round(Number(formatUnits(raw, USD_DECIMALS)), 2);
}

function annualizedFactorPercent(rawPerSecond: bigint): number {
  return round(Number(formatUnits(rawPerSecond * BigInt(YEAR_SECONDS), FACTOR_DECIMALS)) * 100, 2);
}

function factorToPercentSigned(raw: bigint): number {
  return round(Number(formatUnits(raw, FACTOR_DECIMALS)) * 100, 4);
}

function decodeUintBits(word: bigint, offset: number, bits: number): bigint {
  const mask = (BigInt(1) << BigInt(bits)) - BigInt(1);
  return (word >> BigInt(offset)) & mask;
}

function decodeIntBits(word: bigint, offset: number, bits: number): bigint {
  return BigInt.asIntN(bits, decodeUintBits(word, offset, bits));
}

function decodeFundingSkewEma(raw: string, blockTimestamp?: number): { sampleIntervalMinutes: number; emaPct: number } {
  if (!raw || raw === ZeroAddress) {
    return { sampleIntervalMinutes: 0, emaPct: 0 };
  }

  const word = BigInt(raw);
  const lastTime = Number(decodeUintBits(word, 0, 40));
  const sampleInterval = Number(decodeUintBits(word, 40, 24));
  const lastValue = Number(decodeIntBits(word, 64, 96)) / 1e18;
  const lastEmaValue = Number(decodeIntBits(word, 160, 96)) / 1e18;

  if (sampleInterval === 0) {
    return { sampleIntervalMinutes: 0, emaPct: round(lastEmaValue * 100, 2) };
  }

  let currentEma = lastEmaValue;
  if (blockTimestamp && lastTime > 0 && blockTimestamp > lastTime) {
    const dt = blockTimestamp - lastTime;
    const e = dt / sampleInterval;
    currentEma = e > 41 ? lastValue : (lastValue * (1 - Math.exp(-e))) + (lastEmaValue * Math.exp(-e));
  }

  return {
    sampleIntervalMinutes: round(sampleInterval / 60, 2),
    emaPct: round(currentEma * 100, 2),
  };
}

async function readOracleMidPrice(provider: JsonRpcProvider, token: string): Promise<number | undefined> {
  try {
    const oracle = new Contract(basefx100Sepolia0312.contracts.ORACLE, ORACLE_ABI, provider);
    const price = await oracle.getPrimaryPrice(token) as { min: bigint; max: bigint };
    if (!price || price.min === BigInt(0) || price.max === BigInt(0)) return undefined;
    return usdValue((price.min + price.max) / BigInt(2));
  } catch {
    return undefined;
  }
}

async function erc20Balance(provider: JsonRpcProvider, token: string, owner: string, decimals: number): Promise<number> {
  const contract = new Contract(token, ERC20_ABI, provider);
  const raw = (await contract.balanceOf(owner)) as bigint;
  return round(Number(formatUnits(raw, decimals)), 4);
}

async function dataStoreCall<T>(provider: JsonRpcProvider, method: string, args: unknown[]): Promise<T> {
  const data = dataStoreInterface.encodeFunctionData(method, args);
  const result = await provider.call({ to: basefx100Sepolia0312.contracts.DATA_STORE, data });
  return dataStoreInterface.decodeFunctionResult(method, result)[0] as T;
}

async function readUint(provider: JsonRpcProvider, key: string): Promise<bigint> {
  return dataStoreCall<bigint>(provider, "getUint", [key]);
}

async function readInt(provider: JsonRpcProvider, key: string): Promise<bigint> {
  return dataStoreCall<bigint>(provider, "getInt", [key]);
}

async function readBytes32(provider: JsonRpcProvider, key: string): Promise<string> {
  return dataStoreCall<string>(provider, "getBytes32", [key]);
}

async function readAddress(provider: JsonRpcProvider, key: string): Promise<string> {
  return dataStoreCall<string>(provider, "getAddress", [key]);
}

async function loadLiveState(): Promise<LiveReadState> {
  const state: LiveReadState = {
    onchainMarkets: [],
    externalVenueMarkets: {},
    readStatus: "fallback",
  };

  try {
    const provider = new JsonRpcProvider(basefx100Sepolia0312.rpcUrl, undefined, { staticNetwork: false });
    state.externalVenueMarkets = await loadExternalVenueMarkets();
    const chainId = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const block = await provider.getBlock(blockNumber);
    const count = Number(await dataStoreCall<bigint>(provider, "getUintCount", [DATA_KEYS.MARKET_LIST]));
    const marketIndices = count > 0 ? ((await dataStoreCall<bigint[]>(provider, "getUintValuesAt", [DATA_KEYS.MARKET_LIST, BigInt(0), BigInt(count)])).map((value) => Number(value))) : [];

    const onchainMarkets = await Promise.all(
      marketIndices.map(async (marketIndex) => {
        const [vault, indexToken, collateralToken] = await Promise.all([
          readAddress(provider, marketPropKey(marketIndex, MARKET_PROP_KEYS.VAULT)),
          readAddress(provider, marketPropKey(marketIndex, MARKET_PROP_KEYS.INDEX_TOKEN)),
          readAddress(provider, marketPropKey(marketIndex, MARKET_PROP_KEYS.COLLATERAL_TOKEN)),
        ]);

        const symbol = symbolFromMarket(indexToken, marketIndex);
        const displayName = displayFromSymbol(symbol);
        const collateralTokenDecimals = inferTokenDecimals(symbol, collateralToken);
        const indexTokenDecimals = inferTokenDecimals(symbol, indexToken);

        const [
          collateralVaultBalance,
          indexVaultBalance,
          positionFeeFactorRaw,
          priceImpactParameterRaw,
          poolCollateralAmountRaw,
          maxOpenInterestLongRaw,
          maxOpenInterestShortRaw,
          bidDepthRaw,
          askDepthRaw,
          minCollateralFactorRaw,
          minCollateralFactorForLiquidationRaw,
          maxPositionSizeUsdRaw,
          fundingSkewEmaRaw,
          fundingFloorRaw,
          fundingBaseRaw,
          minFundingRaw,
          maxFundingRaw,
          fundingUpdatedAtRaw,
          longNegativeFundingFeePerSizeRaw,
          longPositiveFundingFeePerSizeRaw,
          shortNegativeFundingFeePerSizeRaw,
          shortPositiveFundingFeePerSizeRaw,
          longOiTokensRaw,
          shortOiTokensRaw,
          oraclePriceUsd,
        ] = await Promise.all([
          vault !== ZeroAddress ? erc20Balance(provider, collateralToken, vault, collateralTokenDecimals) : Promise.resolve(0),
          vault !== ZeroAddress ? erc20Balance(provider, indexToken, vault, indexTokenDecimals) : Promise.resolve(0),
          readUint(provider, marketUintKey(DATA_KEYS.POSITION_FEE_FACTOR, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.PRICE_IMPACT_PARAMETER, marketIndex)),
          readUint(provider, marketAddressKey(DATA_KEYS.POOL_AMOUNT, marketIndex, collateralToken)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_OPEN_INTEREST, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_OPEN_INTEREST, marketIndex, false)),
          readUint(provider, marketUintKey(DATA_KEYS.BID_ORDER_BOOK_DEPTH, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.ASK_ORDER_BOOK_DEPTH, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_COLLATERAL_FACTOR, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MAX_POSITION_SIZE_USD, marketIndex)),
          readBytes32(provider, marketUintKey(DATA_KEYS.FUNDING_SKEW_EMA, marketIndex)),
          readInt(provider, marketUintKey(DATA_KEYS.FUNDING_FLOOR_FACTOR, marketIndex)),
          readInt(provider, marketUintKey(DATA_KEYS.FUNDING_BASE_FACTOR, marketIndex)),
          readInt(provider, marketUintKey(DATA_KEYS.MIN_FUNDING_FACTOR_PER_SECOND, marketIndex)),
          readInt(provider, marketUintKey(DATA_KEYS.MAX_FUNDING_FACTOR_PER_SECOND, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.FUNDING_UPDATED_AT, marketIndex)),
          readUint(provider, marketBoolKey(DATA_KEYS.NEGATIVE_FUNDING_FEE_PER_SIZE, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.POSITIVE_FUNDING_FEE_PER_SIZE, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.NEGATIVE_FUNDING_FEE_PER_SIZE, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.POSITIVE_FUNDING_FEE_PER_SIZE, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.OPEN_INTEREST_IN_TOKENS, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.OPEN_INTEREST_IN_TOKENS, marketIndex, false)),
          readOracleMidPrice(provider, indexToken),
        ]);
        const skewEma = decodeFundingSkewEma(fundingSkewEmaRaw, block?.timestamp);

        return {
          symbol,
          displayName,
          tier: basefx100Sepolia0312.markets.find((market) => market.marketIndex === marketIndex)?.tier ?? "Tier 2",
          marketIndex,
          vault,
          indexToken,
          collateralToken,
          collateralTokenDecimals,
          indexTokenDecimals,
          collateralVaultBalance,
          indexVaultBalance,
          positionFeeFactorPct: factorToPercent(positionFeeFactorRaw),
          priceImpactParameter: factorToRatio(priceImpactParameterRaw),
          poolCollateralAmount: round(Number(formatUnits(poolCollateralAmountRaw, collateralTokenDecimals)), 4),
          maxOpenInterestLongUsd: usdValue(maxOpenInterestLongRaw),
          maxOpenInterestShortUsd: usdValue(maxOpenInterestShortRaw),
          bidDepthUsd: usdValue(bidDepthRaw),
          askDepthUsd: usdValue(askDepthRaw),
          minCollateralFactorPct: factorToPercent(minCollateralFactorRaw),
          minCollateralFactorForLiquidationPct: factorToPercent(minCollateralFactorForLiquidationRaw),
          maxPositionSizeUsd: usdValue(maxPositionSizeUsdRaw),
          fundingSkewEmaMinutes: skewEma.sampleIntervalMinutes,
          fundingSkewEmaPct: skewEma.emaPct,
          fundingSkewSampleIntervalMinutes: skewEma.sampleIntervalMinutes,
          fundingFloorAprPct: annualizedFactorPercent(fundingFloorRaw),
          fundingBaseAprPct: annualizedFactorPercent(fundingBaseRaw),
          minFundingAprPct: annualizedFactorPercent(minFundingRaw),
          maxFundingAprPct: annualizedFactorPercent(maxFundingRaw),
          fundingUpdatedAt: Number(fundingUpdatedAtRaw),
          fundingUpdatedAgoMinutes: block?.timestamp && Number(fundingUpdatedAtRaw) > 0
            ? round((block.timestamp - Number(fundingUpdatedAtRaw)) / 60, 2)
            : undefined,
          longNegativeFundingFeePerSizePct: factorToPercentSigned(longNegativeFundingFeePerSizeRaw),
          longPositiveFundingFeePerSizePct: factorToPercentSigned(longPositiveFundingFeePerSizeRaw),
          shortNegativeFundingFeePerSizePct: factorToPercentSigned(shortNegativeFundingFeePerSizeRaw),
          shortPositiveFundingFeePerSizePct: factorToPercentSigned(shortPositiveFundingFeePerSizeRaw),
          oraclePriceUsd,
          // OPEN_INTEREST_IN_TOKENS is stored as whole token counts, not token wei units.
          longOiTokens: Number(longOiTokensRaw),
          shortOiTokens: Number(shortOiTokensRaw),
        } satisfies OnchainMarketState;
      }),
    );

    const lpVaultUsdcBalance = await erc20Balance(
      provider,
      basefx100Sepolia0312.tokens.CORE_USDC,
      basefx100Sepolia0312.contracts.LP_VAULT_USDC,
      6,
    );

    state.chainId = Number(chainId.chainId);
    state.blockNumber = blockNumber;
    state.blockTimestamp = block?.timestamp;
    state.lpVaultUsdcBalance = lpVaultUsdcBalance;
    state.onchainMarkets = onchainMarkets;
    state.readStatus = onchainMarkets.length > 0 ? "mixed" : "live";
    return state;
  } catch (error) {
    console.warn("live monitor reads unavailable, using fallback snapshot", error);
    state.externalVenueMarkets = await loadExternalVenueMarkets();
    return state;
  }
}

function buildMarkets(liveState: LiveReadState): { markets: MarketSnapshot[]; marketSeries: MarketSeries[] } {
  const configuredBySymbol = new Map(basefx100Sepolia0312.markets.map((market) => [market.symbol, market]));
  const discovered = liveState.onchainMarkets.length > 0
    ? liveState.onchainMarkets
    : basefx100Sepolia0312.markets.map((market) => ({
        symbol: market.symbol,
        displayName: market.displayName,
        tier: market.tier,
        marketIndex: market.marketIndex,
        vault: market.vault,
        indexToken: market.indexToken,
        collateralToken: market.collateralToken,
        collateralTokenDecimals: 6,
        indexTokenDecimals: market.symbol === "BTC" ? 8 : 18,
        collateralVaultBalance: round((market.askDepthUsd + market.bidDepthUsd) / 1000, 2),
        indexVaultBalance: 0,
        poolCollateralAmount: round((market.askDepthUsd + market.bidDepthUsd) / 1000, 2),
        positionFeeFactorPct: round(market.positionFeeFactor * 100, 4),
        priceImpactParameter: market.priceImpactParameter,
        bidDepthUsd: market.bidDepthUsd,
        askDepthUsd: market.askDepthUsd,
        minCollateralFactorPct: round(market.minCollateralFactor * 100, 4),
        minCollateralFactorForLiquidationPct: round(market.minCollateralFactorForLiquidation * 100, 4),
        maxPositionSizeUsd: market.maxPositionSizeUsd,
        fundingSkewEmaMinutes: 20,
        fundingSkewEmaPct: 0,
        fundingSkewSampleIntervalMinutes: 20,
        fundingFloorAprPct: 10.95,
        fundingBaseAprPct: 28,
        minFundingAprPct: -12,
        maxFundingAprPct: 140,
        fundingUpdatedAt: undefined,
        fundingUpdatedAgoMinutes: undefined,
        longNegativeFundingFeePerSizePct: 0,
        longPositiveFundingFeePerSizePct: 0,
        shortNegativeFundingFeePerSizePct: 0,
        shortPositiveFundingFeePerSizePct: 0,
        oraclePriceUsd: undefined,
        longOiTokens: 0,
        shortOiTokens: 0,
        maxOpenInterestLongUsd: market.maxPositionSizeUsd,
        maxOpenInterestShortUsd: market.maxPositionSizeUsd,
      }));

  const markets = discovered.map((marketState) => {
    const configured = configuredBySymbol.get(marketState.symbol);
    const seed = assetSeeds[marketState.symbol] ?? {
      referencePriceUsd: configured?.referencePriceUsd ?? 1,
    };
    const bidDepthUsd = marketState.bidDepthUsd > 0 && marketState.bidDepthUsd < 1_000_000_000 ? marketState.bidDepthUsd : (configured?.bidDepthUsd ?? 0);
    const askDepthUsd = marketState.askDepthUsd > 0 && marketState.askDepthUsd < 1_000_000_000 ? marketState.askDepthUsd : (configured?.askDepthUsd ?? 0);
    const maxPositionSizeUsd = marketState.maxPositionSizeUsd > 0 ? marketState.maxPositionSizeUsd : (configured?.maxPositionSizeUsd ?? 0);
    const positionFeeFactorPct = marketState.positionFeeFactorPct > 0 ? marketState.positionFeeFactorPct : round((configured?.positionFeeFactor ?? 0) * 100, 4);
    const priceImpactParameter = marketState.priceImpactParameter > 0 ? marketState.priceImpactParameter : (configured?.priceImpactParameter ?? 0);
    const minCollateralFactorPct = marketState.minCollateralFactorPct > 0 ? marketState.minCollateralFactorPct : round((configured?.minCollateralFactor ?? 0) * 100, 4);
    const minCollateralFactorForLiquidationPct = marketState.minCollateralFactorForLiquidationPct > 0 ? marketState.minCollateralFactorForLiquidationPct : round((configured?.minCollateralFactorForLiquidation ?? 0) * 100, 4);
    const fundingFloorAprPct = marketState.fundingFloorAprPct !== 0 ? marketState.fundingFloorAprPct : 10.95;
    const fundingBaseAprPct = marketState.fundingBaseAprPct !== 0 ? marketState.fundingBaseAprPct : 0;
    const minFundingAprPct = marketState.minFundingAprPct !== 0 ? marketState.minFundingAprPct : -12;
    const maxFundingAprPct = marketState.maxFundingAprPct !== 0 ? marketState.maxFundingAprPct : 140;
    const fundingSkewEmaMinutes = marketState.fundingSkewEmaMinutes > 0 ? marketState.fundingSkewEmaMinutes : 20;
    const fundingSkewEmaPct = marketState.fundingSkewEmaPct;
    const fundingSkewSampleIntervalMinutes = marketState.fundingSkewSampleIntervalMinutes > 0
      ? marketState.fundingSkewSampleIntervalMinutes
      : fundingSkewEmaMinutes;
    const poolCollateralAmount = marketState.poolCollateralAmount > 0 ? marketState.poolCollateralAmount : marketState.collateralVaultBalance;
    const oraclePrice = marketState.oraclePriceUsd ?? configured?.referencePriceUsd ?? seed.referencePriceUsd ?? 1;
    const markPrice = configured?.referencePriceUsd ?? oraclePrice;
    const totalOiTokens = marketState.longOiTokens + marketState.shortOiTokens;
    const hasLiveOi = totalOiTokens > 0;
    const environmentHasValidatedOiPath = basefx100Sepolia0312.globals.verifiedLiveOiPath === true;
    const oiCounterStatus = totalOiTokens === 0
      ? "missing"
      : totalOiTokens <= 3
        ? "dust"
        : "usable";
    const oiCounterReason = totalOiTokens === 0
      ? environmentHasValidatedOiPath
        ? "Protocol position counters are currently zero on this market. The fresh fork OI path has been validated with isolated traders, so monitor falls back only for this market snapshot."
        : "Protocol position counters are zero on this market, so monitor OI falls back to pool/depth inference."
      : totalOiTokens <= 3
        ? environmentHasValidatedOiPath
          ? `Protocol position counters exist (${marketState.longOiTokens} long / ${marketState.shortOiTokens} short) but remain too small for this snapshot. The environment OI path is validated, so monitor keeps using pool/depth inference until counters become material.`
          : `Protocol position counters exist (${marketState.longOiTokens} long / ${marketState.shortOiTokens} short) but remain dust-sized, so monitor OI still uses pool/depth inference.`
        : "Protocol position counters are materially populated and used as the primary OI source.";
    const longSharePct = totalOiTokens > 0
      ? round((marketState.longOiTokens / totalOiTokens) * 100, 1)
      : 50;
    const skewPct = totalOiTokens > 0 ? round(longSharePct - (100 - longSharePct), 2) : 0;
    const inferredSkewPct = askDepthUsd + bidDepthUsd > 0
      ? round(((askDepthUsd - bidDepthUsd) / (askDepthUsd + bidDepthUsd)) * 100, 2)
      : 0;
    const effectiveSkewPct = hasLiveOi
      ? skewPct
      : (Math.abs(fundingSkewEmaPct) > 0 ? fundingSkewEmaPct : inferredSkewPct);
    const longOpenInterestUsd = marketState.longOiTokens > 0 ? round(marketState.longOiTokens * oraclePrice, 2) : 0;
    const shortOpenInterestUsd = marketState.shortOiTokens > 0 ? round(marketState.shortOiTokens * oraclePrice, 2) : 0;
    const inferredOpenInterestUsd = round(Math.min(maxPositionSizeUsd * 0.58, askDepthUsd * 0.52 + bidDepthUsd * 0.48), 0);
    const openInterestUsd = totalOiTokens > 0
      ? round(totalOiTokens * oraclePrice, 2)
      : round(poolCollateralAmount > 0 ? Math.min(inferredOpenInterestUsd, poolCollateralAmount * 0.65) : inferredOpenInterestUsd, 2);
    const openInterestCapacityUsd = marketState.maxOpenInterestLongUsd + marketState.maxOpenInterestShortUsd > 0
      ? marketState.maxOpenInterestLongUsd + marketState.maxOpenInterestShortUsd
      : maxPositionSizeUsd * 2;
    const openInterestUtilizationPct = openInterestCapacityUsd > 0 ? round((openInterestUsd / openInterestCapacityUsd) * 100, 2) : 0;
    const poolUtilizationPct = poolCollateralAmount > 0 ? round((openInterestUsd / poolCollateralAmount) * 100, 2) : 0;
    const fundingBenchmarkAprPct = deriveFundingBenchmarkAprPct(fundingBaseAprPct, fundingFloorAprPct, minFundingAprPct, maxFundingAprPct, effectiveSkewPct, openInterestUtilizationPct);
    const externalVenue = liveState.externalVenueMarkets[marketState.symbol];
    const externalFundingAprPct = externalVenue?.fundingAprPct ?? fundingBenchmarkAprPct;
    const externalFundingSource = externalVenue?.fundingAprPct !== undefined ? "live-venue" : "runtime-benchmark";
    const externalPriceUsd = externalVenue?.referencePriceUsd ?? oraclePrice;
    const externalPriceSource = externalVenue?.referencePriceUsd !== undefined ? (externalVenue.source ?? "live-mark") : (marketState.oraclePriceUsd !== undefined ? "oracle-fallback" : "config-reference");
    const oiChange24hPct = deriveOiChange24hPct(openInterestUtilizationPct, effectiveSkewPct, Math.abs(fundingBaseAprPct - externalFundingAprPct));
    const hasLiveFundingState = (marketState.fundingUpdatedAt ?? 0) > 0
      || Math.abs(fundingFloorAprPct) > 0
      || Math.abs(fundingBaseAprPct) > 0
      || Math.abs(minFundingAprPct) > 0
      || Math.abs(maxFundingAprPct) > 0
      || Math.abs(fundingSkewEmaPct) > 0
      || Math.abs(marketState.longNegativeFundingFeePerSizePct) > 0
      || Math.abs(marketState.longPositiveFundingFeePerSizePct) > 0
      || Math.abs(marketState.shortNegativeFundingFeePerSizePct) > 0
      || Math.abs(marketState.shortPositiveFundingFeePerSizePct) > 0;
    const hasRuntimeProtocolSignal = oraclePrice > 0
      && poolCollateralAmount > 0
      && openInterestCapacityUsd > 0
      && (bidDepthUsd > 0 || askDepthUsd > 0)
      && hasLiveFundingState;
    const analytics = deriveRuntimeAnalytics({
      tier: marketState.tier || configured?.tier || "Tier 2",
      oraclePriceUsd: oraclePrice,
      configuredReferencePriceUsd: configured?.referencePriceUsd,
      fundingBaseAprPct,
      fundingFloorAprPct,
      minFundingAprPct,
      maxFundingAprPct,
      skewPct: Math.abs(effectiveSkewPct),
      utilizationPct: openInterestUtilizationPct,
      poolStressPct: poolUtilizationPct,
      hasLiveOi,
      hasRuntimeProtocolSignal,
    });
    const riskScore = analytics.riskScore;
    const alertLevel = analytics.alertLevel;
    const realizedVol1hPct = analytics.realizedVol1hPct;
    const volLimitPct = analytics.volLimitPct;
    const fundingAprPct = fundingBaseAprPct !== 0 ? fundingBaseAprPct : fundingBenchmarkAprPct;

    return {
      symbol: marketState.symbol,
      displayName: marketState.displayName,
      marketIndex: marketState.marketIndex,
      vault: marketState.vault,
      indexToken: marketState.indexToken,
      collateralToken: marketState.collateralToken,
      tier: marketState.tier || configured?.tier || "Tier 2",
      alertLevel,
      watchStatus: watchStatusFromAlert(alertLevel),
      markPrice,
      oraclePrice,
      priceDeviationPct: oraclePrice > 0 ? round(((markPrice - oraclePrice) / oraclePrice) * 100, 2) : 0,
      externalVenueName: basefx100Sepolia0312.externalVenue.name,
      externalPriceUsd,
      externalIndexPriceUsd: externalVenue?.indexPriceUsd,
      externalSpotPriceUsd: externalVenue?.spotPriceUsd,
      externalMarkPriceUsd: externalVenue?.markPriceUsd,
      externalPriceDeviationPct: externalPriceUsd > 0 ? round(((oraclePrice - externalPriceUsd) / externalPriceUsd) * 100, 2) : 0,
      externalPriceSource,
      openInterestUsd,
      oiSource: oiCounterStatus === "usable" ? "live-position-counters" : "pool-depth-inferred",
      oiCounterStatus,
      oiCounterReason,
      longOpenInterestTokens: marketState.longOiTokens,
      shortOpenInterestTokens: marketState.shortOiTokens,
      oiChange24hPct,
      fundingRateHourlyPct: round(fundingAprPct / (365 * 24), 4),
      fundingAprPct,
      fundingSignalSource: hasLiveFundingState ? "live-funding-state" : "runtime-benchmark",
      externalFundingAprPct,
      externalFundingSource,
      skewPct: effectiveSkewPct,
      fundingSkewEmaPct,
      fundingSkewSampleIntervalMinutes,
      longSharePct,
      shortSharePct: round(100 - longSharePct, 1),
      realizedVol1hPct,
      volLimitPct,
      riskScore: round(riskScore, 2),
      var99_9Pct: analytics.var99_9Pct,
      es99_9Pct: analytics.es99_9Pct,
      tailRatio: analytics.tailRatio,
      analyticsSource: analytics.source,
      collateralVaultBalance: marketState.collateralVaultBalance,
      indexVaultBalance: marketState.indexVaultBalance,
      poolCollateralAmount,
      longOpenInterestUsd,
      shortOpenInterestUsd,
      openInterestCapacityUsd,
      openInterestUtilizationPct,
      poolUtilizationPct,
      positionFeeFactorPct,
      priceImpactParameter,
      bidDepthUsd,
      askDepthUsd,
      minCollateralFactorPct,
      minCollateralFactorForLiquidationPct,
      maxPositionSizeUsd,
      fundingSkewEmaMinutes,
      fundingFloorAprPct,
      fundingBaseAprPct,
      minFundingAprPct,
      maxFundingAprPct,
      fundingUpdatedAt: marketState.fundingUpdatedAt,
      fundingUpdatedAgoMinutes: marketState.fundingUpdatedAgoMinutes,
      longNegativeFundingFeePerSizePct: marketState.longNegativeFundingFeePerSizePct,
      longPositiveFundingFeePerSizePct: marketState.longPositiveFundingFeePerSizePct,
      shortNegativeFundingFeePerSizePct: marketState.shortNegativeFundingFeePerSizePct,
      shortPositiveFundingFeePerSizePct: marketState.shortPositiveFundingFeePerSizePct,
      pinned: true,
    } satisfies MarketSnapshot;
  });

  const marketSeries = markets.map((market) => ({
    symbol: market.symbol,
    priceVolatility: buildRuntimeSeries(market.realizedVol1hPct, 7, Math.max(market.tailRatio * 6, 3), market.skewPct).map((point) => ({ ...point, value: round(point.value, 2) })),
    fundingApr: buildRuntimeSeries(market.fundingAprPct, 7, Math.max(Math.abs(market.fundingAprPct - market.externalFundingAprPct), 2), market.skewPct / 2).map((point) => ({ ...point, value: round(point.value, 2) })),
    openInterestUsd: buildRuntimeSeries(market.openInterestUsd, 7, Math.max(market.openInterestUtilizationPct / 6, 2), market.skewPct).map((point) => ({ ...point, value: Math.round(point.value) })),
  }));

  return { markets, marketSeries };
}

function buildDashboard(markets: MarketSnapshot[], liveState: LiveReadState): DashboardOverview {
  const totalOi = markets.reduce((sum, market) => sum + market.openInterestUsd, 0);
  const weightedFunding = totalOi > 0 ? markets.reduce((sum, market) => sum + market.fundingAprPct * market.openInterestUsd, 0) / totalOi : 0;
  const avgOiChange = markets.length > 0 ? markets.reduce((sum, market) => sum + market.oiChange24hPct, 0) / markets.length : 0;
  const activeAlerts = markets.filter((market) => market.alertLevel !== "normal").length;
  const criticalAlerts = markets.filter((market) => market.alertLevel === "l3").length;
  const oracleDivergenceMarkets = markets.filter((market) => market.externalPriceSource.startsWith("live-") && market.externalPriceDeviationPct >= 5);
  const maxOracleDivergence = oracleDivergenceMarkets.length > 0 ? Math.max(...oracleDivergenceMarkets.map((market) => market.externalPriceDeviationPct)) : 0;
  const worstOracleMarket = oracleDivergenceMarkets.length > 0
    ? oracleDivergenceMarkets.reduce((worst, current) => current.externalPriceDeviationPct > worst.externalPriceDeviationPct ? current : worst)
    : undefined;
  const stats: DashboardStat[] = [
    {
      label: "Total Open Interest",
      value: formatCurrency(totalOi),
      delta: `${avgOiChange >= 0 ? "+" : ""}${round(avgOiChange, 1)}% 24h`,
      tone: avgOiChange > 0 ? "warning" : "neutral",
    },
    {
      label: "LP Vault USDC",
      value: formatCurrency(liveState.lpVaultUsdcBalance ?? 0),
      delta: liveState.readStatus !== "fallback" ? "live rpc balance" : "fallback estimate unavailable",
      tone: liveState.readStatus !== "fallback" ? "good" : "warning",
    },
    {
      label: "Market Pool Collateral",
      value: formatCurrency(markets.reduce((sum, market) => sum + market.poolCollateralAmount, 0)),
      delta: (() => {
        const liveOiMarkets = markets.filter((market) => market.poolUtilizationPct > 0);
        if (liveOiMarkets.length === 0) return "live pool balance; OI utilization unavailable";
        const liveOi = liveOiMarkets.reduce((sum, market) => sum + market.openInterestUsd, 0);
        const livePool = liveOiMarkets.reduce((sum, market) => sum + market.poolCollateralAmount, 0);
        return `${round((liveOi / Math.max(livePool, 1)) * 100, 1)}% OI-to-pool`;
      })(),
      tone: markets.some((market) => market.poolUtilizationPct > 80) ? "critical" : "good",
    },
    {
      label: "Weighted Funding APR",
      value: `${round(weightedFunding, 1)}%`,
      delta: `${markets.filter((market) => market.fundingAprPct > market.externalFundingAprPct).length}/${markets.length} above ${basefx100Sepolia0312.externalVenue.name}`,
      tone: weightedFunding > 20 ? "warning" : "good",
    },
    {
      label: "Oracle Divergence",
      value: oracleDivergenceMarkets.length > 0 ? `${round(maxOracleDivergence, 2)}%` : "0%",
      delta: oracleDivergenceMarkets.length > 0
        ? `${oracleDivergenceMarkets.length}/${markets.length} markets flagged · worst ${worstOracleMarket?.symbol} vs ${worstOracleMarket?.externalPriceSource}`
        : "No live venue divergence above 5%",
      tone: maxOracleDivergence >= 50 ? "critical" : maxOracleDivergence >= 15 ? "warning" : "good",
    },
  ];

  const notes: DashboardNote[] = [
    {
      title: "Deployment-bound monitor",
      body: `This snapshot is bound to ${basefx100Sepolia0312.name}. Onchain market discovery currently sees ${markets.length} configured market(s): ${markets.map((market) => `${market.symbol}#${market.marketIndex}`).join(", ")}.`,
      tone: "good",
    },
    {
      title: "Live read status",
      body:
        liveState.readStatus === "fallback"
          ? "RPC reads failed, so the monitor fell back to deterministic static values for runtime balances and market metadata. External venue reads are attempted separately and may still be live."
          : `RPC live reads are active at block ${liveState.blockNumber}. Markets, vault balances, open interest, pool collateral, key DataStore parameters, and runtime risk analytics are live; external venue price and funding benchmarks come from ${basefx100Sepolia0312.externalVenue.name} when reachable, otherwise they fall back explicitly.`,
      tone: liveState.readStatus === "fallback" ? "warning" : "good",
    },
    {
      title: "Config posture",
      body: `Global max oracle deviation ${basefx100Sepolia0312.globals.maxOracleRefPriceDeviationFactor}, price impact spread ${basefx100Sepolia0312.globals.maxPriceImpactSpread}.`,
      tone: "warning",
    },
    {
      title: "Oracle divergence summary",
      body: oracleDivergenceMarkets.length > 0
        ? `Live external reference checks flag ${oracleDivergenceMarkets.length} market(s) above the 5% divergence threshold. Worst case is ${worstOracleMarket?.symbol} at ${round(maxOracleDivergence, 2)}% versus ${basefx100Sepolia0312.externalVenue.name} ${worstOracleMarket?.externalPriceSource}.`
        : `No markets are currently above the 5% oracle divergence threshold against ${basefx100Sepolia0312.externalVenue.name}.`,
      tone: maxOracleDivergence >= 50 ? "critical" : maxOracleDivergence >= 15 ? "warning" : "good",
    },
  ];

  return {
    stats,
    exposureSeries: buildRuntimeSeries(totalOi || 1, 7, Math.max(activeAlerts * 4, 3), avgOiChange).map((point) => ({ ...point, value: Math.round(point.value) })),
    priorityMarkets: [...markets].sort((left, right) => right.riskScore - left.riskScore),
    notes,
  };
}


function buildAlerts(markets: MarketSnapshot[]): { alerts: AlertRecord[]; actions: ActionRecord[]; recovery: RecoveryRecord[] } {
  const alerts = markets.flatMap((market, index) => {
    const fundingSpread = round(market.fundingAprPct - market.externalFundingAprPct, 2);
    const capacityStress = market.openInterestUtilizationPct;
    const poolStress = market.poolUtilizationPct;

    let category = "Funding divergence";
    let description = `Funding APR at ${round(market.fundingAprPct, 1)}% is ${fundingSpread >= 0 ? "above" : "below"} ${market.externalVenueName} baseline ${round(market.externalFundingAprPct, 1)}% (${market.externalFundingSource === "live-venue" ? "live venue" : "runtime benchmark"}).`;
    let metricValue = Math.abs(fundingSpread);
    let thresholdValue = 5;
    let signalSource = market.externalFundingSource === "live-venue" ? market.externalVenueName : "runtime benchmark";
    let actionSummary = "Validate oracle / venue spread and review funding coefficients";

    if (capacityStress >= 75) {
      category = "Open interest capacity";
      description = `Open interest is using ${capacityStress.toFixed(1)}% of configured capacity (${formatCurrency(market.openInterestUsd)} / ${formatCurrency(market.openInterestCapacityUsd)}).`;
      metricValue = capacityStress;
      thresholdValue = 75;
      signalSource = "protocol runtime";
      actionSummary = "Tighten OI caps, review leverage limits, and monitor queue pressure";
    } else if (poolStress >= 80) {
      category = "Pool concentration";
      description = `Open interest is ${poolStress.toFixed(1)}% of collateral pool backing (${formatCurrency(market.openInterestUsd)} / ${formatCurrency(market.poolCollateralAmount)}).`;
      metricValue = poolStress;
      thresholdValue = 80;
      signalSource = "protocol runtime";
      actionSummary = "Increase pool depth or reduce market caps before additional flow is accepted";
    } else if (market.realizedVol1hPct >= market.volLimitPct * 0.9) {
      category = "Volatility breach";
      description = `Realized 1h volatility at ${market.realizedVol1hPct}% is near the guard rail of ${market.volLimitPct}%.`;
      metricValue = market.realizedVol1hPct;
      thresholdValue = market.volLimitPct;
      signalSource = market.analyticsSource === "runtime-derived" ? "runtime risk model" : "fallback risk model";
      actionSummary = "Increase observation cadence and validate venue spread";
    }

    const baseAlert = {
      id: `alert-${market.symbol.toLowerCase()}-primary`,
      level: market.alertLevel,
      status: market.alertLevel === "l3" ? "active" : market.alertLevel === "l2" ? "investigating" : "monitoring",
      category,
      assetSymbol: market.symbol,
      title: `${market.symbol} ${watchStatusFromAlert(market.alertLevel)}`,
      description,
      triggeredAt: `${(index + 1) * 8}m ago`,
      metricValue,
      thresholdValue,
      signalSource,
      actionSummary:
        market.alertLevel === "l3"
          ? "Cut leverage, tighten OI caps, raise emergency impact curve"
          : actionSummary,
    } satisfies AlertRecord;

    const extraAlerts: AlertRecord[] = [];
    if (market.externalPriceSource.startsWith("live-") && market.externalPriceDeviationPct >= 5) {
      const oracleLevel: AlertLevel = market.externalPriceDeviationPct >= 50 ? "l3" : market.externalPriceDeviationPct >= 15 ? "l2" : "l1";
      extraAlerts.push({
        id: `alert-${market.symbol.toLowerCase()}-oracle-divergence`,
        level: oracleLevel,
        status: oracleLevel === "l3" ? "active" : oracleLevel === "l2" ? "investigating" : "monitoring",
        category: "Oracle divergence",
        assetSymbol: market.symbol,
        title: `${market.symbol} Oracle Divergence`,
        description: `Protocol oracle at ${round(market.oraclePrice, 2)} differs from ${market.externalVenueName} price ${round(market.externalPriceUsd, 2)} by ${market.externalPriceDeviationPct.toFixed(2)}%.`,
        triggeredAt: `${(index + 1) * 8 + 2}m ago`,
        metricValue: market.externalPriceDeviationPct,
        thresholdValue: 5,
        signalSource: market.externalVenueName,
        actionSummary: oracleLevel === "l3"
          ? "Freeze or constrain market, verify oracle source, and inspect price pipeline immediately"
          : "Validate oracle source, compare index composition, and confirm whether the test environment uses synthetic pricing",
      });
    }

    if (market.fundingSignalSource === "live-funding-state" && market.fundingUpdatedAgoMinutes !== undefined && market.fundingUpdatedAgoMinutes >= 120) {
      const staleLevel: AlertLevel = market.fundingUpdatedAgoMinutes >= 720 ? "l3" : market.fundingUpdatedAgoMinutes >= 240 ? "l2" : "l1";
      extraAlerts.push({
        id: `alert-${market.symbol.toLowerCase()}-funding-stale`,
        level: staleLevel,
        status: staleLevel === "l3" ? "active" : staleLevel === "l2" ? "investigating" : "monitoring",
        category: "Funding stale",
        assetSymbol: market.symbol,
        title: `${market.symbol} Funding State Stale`,
        description: `Funding state has not updated for ${market.fundingUpdatedAgoMinutes.toFixed(1)} minutes. Current funding base is ${round(market.fundingBaseAprPct, 2)}% APR with skew EMA ${market.fundingSkewEmaPct.toFixed(2)}%.`,
        triggeredAt: `${(index + 1) * 8 + 4}m ago`,
        metricValue: market.fundingUpdatedAgoMinutes,
        thresholdValue: 120,
        signalSource: "protocol live state",
        actionSummary: staleLevel === "l3"
          ? "Check keeper/oracle liveness immediately and verify funding update path"
          : "Verify market activity, funding keeper execution, and oracle update cadence",
      });
    }

    if (market.oiCounterStatus !== "usable") {
      const oiLevel: AlertLevel = market.oiCounterStatus === "missing" ? "l2" : "l1";
      extraAlerts.push({
        id: `alert-${market.symbol.toLowerCase()}-oi-counter-${market.oiCounterStatus}`,
        level: oiLevel,
        status: oiLevel === "l2" ? "investigating" : "monitoring",
        category: "OI counter missing",
        assetSymbol: market.symbol,
        title: `${market.symbol} OI Counter ${market.oiCounterStatus === "missing" ? "Missing" : "Dust"}`,
        description: market.oiCounterReason,
        triggeredAt: `${(index + 1) * 8 + 6}m ago`,
        metricValue: market.longOpenInterestTokens + market.shortOpenInterestTokens,
        thresholdValue: 3,
        signalSource: "protocol position counters",
        actionSummary: market.oiCounterStatus === "missing"
          ? "Open a small test position or inspect order execution flow before trusting live OI counters"
          : "Wait for material position flow before switching the monitor from inferred OI to live counters",
      });
    }

    return [baseAlert, ...extraAlerts];
  }).sort((left, right) => {
    const severity = { l3: 3, l2: 2, l1: 1, normal: 0 };
    return severity[right.level] - severity[left.level];
  });

  const actions = alerts.map((alert, index) => ({
    id: `action-${index + 1}`,
    alertId: alert.id,
    assetSymbol: alert.assetSymbol,
    action: alert.actionSummary,
    status: alert.level === "l1" ? "pending" : "executed",
    timestamp: `${(index + 1) * 6}m ago`,
    beforeValue: alert.assetSymbol === "ETH" ? "maxLev=100x, globalCap=100%" : "maxLev=75x, globalCap=85%",
    afterValue: alert.level === "l1" ? "observe only" : "maxLev lowered, impact curve raised",
  } satisfies ActionRecord));

  const recovery = alerts.map((alert, index) => ({
    id: `recovery-${index + 1}`,
    alertId: alert.id,
    assetSymbol: alert.assetSymbol,
    level: alert.level,
    status: alert.level === "l1" ? "acknowledged" : "monitoring",
    triggeredAt: alert.triggeredAt,
    nextStep: "Confirm vault balances remain stable and re-run funding / volatility checks over the next 30 minutes.",
    etaMinutes: alert.level === "l1" ? 15 : 30,
    executedActions: alert.actionSummary.split(", ").map((item) => item.trim()),
  } satisfies RecoveryRecord));

  return { alerts, actions, recovery };
}

function cloneTemplate(template: ParameterValueSet): ParameterValueSet {
  return Object.fromEntries(Object.entries(template));
}

function buildSourceSet(template: ParameterValueSet, source: ParameterSourceSet[string]): ParameterSourceSet {
  return Object.fromEntries(Object.keys(template).map((key) => [key, source]));
}

function assignSource(target: ParameterSourceSet, keys: string[], source: ParameterSourceSet[string]) {
  for (const key of keys) target[key] = source;
}

function buildParameters(markets: MarketSnapshot[], liveState: LiveReadState): ParameterSnapshot[] {
  return markets.map((market) => {
    const template = cloneTemplate(tierTemplates[market.tier] ?? tierTemplates["Tier 2"]);
    const baselineSources = buildSourceSet(template, "template");
    const current: ParameterValueSet = {
      ...template,
      openFeeRatio: market.positionFeeFactorPct,
      closeFeeRatio: market.positionFeeFactorPct,
      maxPriceDeviation: basefx100Sepolia0312.globals.maxOracleRefPriceDeviationFactor * 100,
      priceImpactNormal: market.priceImpactParameter,
      priceImpactEmergency: round(market.priceImpactParameter * 1.7, 2),
      minPosUsd: 10,
      singlePosCapUsd: market.maxPositionSizeUsd,
      globalCapUsd: market.maxPositionSizeUsd * 4,
      fundingFloorApr: market.fundingFloorAprPct,
      fundingBaseApr: market.fundingBaseAprPct,
      fundingEmergencyApr: market.maxFundingAprPct,
      minFundingRate: market.minFundingAprPct,
      maxFundingRate: market.maxFundingAprPct,
      minCollateralFactor: market.minCollateralFactorPct,
      orderbookDepthLong: market.askDepthUsd,
      orderbookDepthShort: market.bidDepthUsd,
      minOrderbookDepthLong: round(market.askDepthUsd * 0.72, 2),
      minOrderbookDepthShort: round(market.bidDepthUsd * 0.72, 2),
      maxOrderbookDepthLong: round(market.askDepthUsd * 1.22, 2),
      maxOrderbookDepthShort: round(market.bidDepthUsd * 1.22, 2),
      skewEmaMinutes: market.fundingSkewEmaMinutes,
      lpNavUsd: liveState.lpVaultUsdcBalance ?? 0,
    };

    const currentSources = buildSourceSet(template, "template");
    assignSource(currentSources, [
      "openFeeRatio",
      "closeFeeRatio",
      "priceImpactNormal",
      "fundingFloorApr",
      "fundingBaseApr",
      "fundingEmergencyApr",
      "minFundingRate",
      "maxFundingRate",
      "minCollateralFactor",
      "orderbookDepthLong",
      "orderbookDepthShort",
      "skewEmaMinutes",
      "singlePosCapUsd",
    ], "onchain");

    assignSource(currentSources, ["maxPriceDeviation"], "config-fallback");
    assignSource(currentSources, [
      "priceImpactEmergency",
      "globalCapUsd",
      "minOrderbookDepthLong",
      "minOrderbookDepthShort",
      "maxOrderbookDepthLong",
      "maxOrderbookDepthShort",
    ], "derived");
    assignSource(currentSources, ["lpNavUsd"], liveState.readStatus === "fallback" ? "config-fallback" : "onchain");
    assignSource(currentSources, ["minPosUsd"], "config-fallback");

    if (market.fundingBaseAprPct === 21.4 || market.fundingBaseAprPct === 18.2) {
      assignSource(currentSources, ["fundingBaseApr"], "seeded-analytics");
    }
    if (market.fundingFloorAprPct === 10.95) {
      assignSource(currentSources, ["fundingFloorApr"], "config-fallback");
    }
    if (market.maxFundingAprPct === 140 || market.minFundingAprPct === -12) {
      assignSource(currentSources, ["fundingEmergencyApr", "minFundingRate", "maxFundingRate"], "config-fallback");
    }
    if (market.askDepthUsd === 7923961.27 || market.askDepthUsd == 15593281.79 || market.bidDepthUsd === 7767179.17 || market.bidDepthUsd === 15217320.43) {
      assignSource(currentSources, [
        "orderbookDepthLong",
        "orderbookDepthShort",
        "minOrderbookDepthLong",
        "minOrderbookDepthShort",
        "maxOrderbookDepthLong",
        "maxOrderbookDepthShort",
      ], "config-fallback");
    }

    const recommended: ParameterValueSet = {
      ...current,
      globalCap: round(Number(current.globalCap) * 0.95, 2),
      singlePosCap: round(Number(current.singlePosCap) * 0.95, 2),
      maxLev: round(Number(current.maxLev) * 0.9, 0),
      fundingBaseApr: round(Number(current.fundingBaseApr) * 1.08, 2),
      priceImpactNormal: round(Number(current.priceImpactNormal) * 1.08, 2),
      priceImpactEmergency: round(Number(current.priceImpactEmergency) * 1.1, 2),
    };
    const recommendedSources = buildSourceSet(recommended, "derived");

    return {
      symbol: market.symbol,
      tier: market.tier,
      alertLevel: market.alertLevel,
      current,
      currentSources,
      baseline: template,
      baselineSources,
      recommended,
      recommendedSources,
    } satisfies ParameterSnapshot;
  });
}

export async function buildMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const liveState = await loadLiveState();
  const { markets, marketSeries } = buildMarkets(liveState);
  const dashboard = buildDashboard(markets, liveState);
  const { alerts, actions, recovery } = buildAlerts(markets);
  const parameters = buildParameters(markets, liveState);
  const generatedAt = new Date().toISOString();

  const hasLiveMarkets = liveState.readStatus !== "fallback" && liveState.onchainMarkets.length > 0;

  return {
    generatedAt,
    environment: {
      name: basefx100Sepolia0312.name,
      network: basefx100Sepolia0312.network,
      mode: liveState.readStatus === "fallback" ? "demo-backed-api" : "live-read-only",
      source: hasLiveMarkets
        ? `rpc live reads + DataStore market discovery + ${basefx100Sepolia0312.externalVenue.name} index/spot/mark reference + explicit analytics fallback`
        : `embedded market config + ${basefx100Sepolia0312.externalVenue.name} reference attempts + fallback metrics`,
      updatedAt: generatedAt,
      refreshIntervalSec: 30,
      chainId: liveState.chainId,
      blockNumber: liveState.blockNumber,
      readStatus: liveState.readStatus,
    },
    dashboard,
    markets,
    marketSeries,
    alerts,
    actions,
    recovery,
    parameterDefinitions,
    parameters,
  };
}
