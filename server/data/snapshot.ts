import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
} from "../../shared/monitoring.ts";
import { basefx100Sepolia0312 } from "../config/fx100.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

const abiCoder = AbiCoder.defaultAbiCoder();
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const FACTOR_DECIMALS = 30;
const USD_DECIMALS = 30;

const DATA_STORE_ABI = [
  "function getUint(bytes32 key) view returns (uint256)",
  "function getAddress(bytes32 key) view returns (address)",
  "function getUintCount(bytes32 setKey) view returns (uint256)",
  "function getUintValuesAt(bytes32 setKey, uint256 start, uint256 end) view returns (uint256[])",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
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

interface RiskCsvRow {
  symbol: string;
  Current_Tier: string;
  VaR_P99_9: string;
  ES_P99_9: string;
  ES_VaR_Ratio_P99_9: string;
  Risk_Score: string;
  Recommended_Tier: string;
  Alert_Level: string;
}

interface AssetSeed {
  price: number;
  fundingApr: number;
  externalFundingApr: number;
  skewPct: number;
  oiChange24hPct: number;
  oracleDriftPct: number;
}

interface OnchainMarketState {
  symbol: string;
  displayName: string;
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
  fundingFloorAprPct: number;
  fundingBaseAprPct: number;
  minFundingAprPct: number;
  maxFundingAprPct: number;
  fundingUpdatedAt?: number;
  longOiTokens: number;
  shortOiTokens: number;
  maxOpenInterestLongUsd: number;
  maxOpenInterestShortUsd: number;
}

interface LiveReadState {
  chainId?: number;
  blockNumber?: number;
  lpVaultUsdcBalance?: number;
  readStatus: EnvironmentInfo["readStatus"];
  onchainMarkets: OnchainMarketState[];
}

const assetSeeds: Record<string, AssetSeed> = {
  ETH: { price: 4425, fundingApr: 21.4, externalFundingApr: 17.6, skewPct: 19, oiChange24hPct: 9.4, oracleDriftPct: 0.02 },
  BTC: { price: 84210, fundingApr: 18.2, externalFundingApr: 14.8, skewPct: 14, oiChange24hPct: 6.8, oracleDriftPct: 0.03 },
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

function shiftSeries(current: number, changePct: number, points: number, volatility: number): MetricPoint[] {
  return Array.from({ length: points }).map((_, index) => {
    const factor = (index - (points - 1)) / (points - 1);
    const drift = 1 + (changePct / 100) * factor;
    const noise = 1 + Math.sin(index * 1.7) * (volatility / 100) * 0.15;
    return {
      time: `${String(index * 4).padStart(2, "0")}:00`,
      value: Number((current / (drift * noise)).toFixed(2)),
    };
  });
}

function parseCsv(text: string): string[][] {
  return text.trim().split(/\r?\n/).map((line) => line.split(","));
}

async function loadRiskRows(): Promise<RiskCsvRow[]> {
  const filePath = path.join(projectRoot, "docs", "risk_score_all_assets.csv");
  const raw = await fs.readFile(filePath, "utf8");
  const [header, ...rows] = parseCsv(raw);
  return rows.map((row) => ({
    symbol: row[header.indexOf("symbol")],
    Current_Tier: row[header.indexOf("Current_Tier")],
    VaR_P99_9: row[header.indexOf("VaR_P99.9")],
    ES_P99_9: row[header.indexOf("ES_P99.9")],
    ES_VaR_Ratio_P99_9: row[header.indexOf("ES_VaR_Ratio_P99.9")],
    Risk_Score: row[header.indexOf("Risk_Score")],
    Recommended_Tier: row[header.indexOf("Recommended_Tier")],
    Alert_Level: row[header.indexOf("Alert_Level")],
  }));
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

async function readAddress(provider: JsonRpcProvider, key: string): Promise<string> {
  return dataStoreCall<string>(provider, "getAddress", [key]);
}

async function loadLiveState(): Promise<LiveReadState> {
  const state: LiveReadState = {
    onchainMarkets: [],
    readStatus: "fallback",
  };

  try {
    const provider = new JsonRpcProvider(basefx100Sepolia0312.rpcUrl, undefined, { staticNetwork: false });
    const chainId = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
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
          longOiTokensRaw,
          shortOiTokensRaw,
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
          readUint(provider, marketUintKey(DATA_KEYS.FUNDING_SKEW_EMA, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.FUNDING_FLOOR_FACTOR, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.FUNDING_BASE_FACTOR, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_FUNDING_FACTOR_PER_SECOND, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MAX_FUNDING_FACTOR_PER_SECOND, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.FUNDING_UPDATED_AT, marketIndex)),
          readUint(provider, marketBoolKey(DATA_KEYS.OPEN_INTEREST_IN_TOKENS, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.OPEN_INTEREST_IN_TOKENS, marketIndex, false)),
        ]);

        return {
          symbol,
          displayName,
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
          fundingSkewEmaMinutes: round(Number(fundingSkewEmaRaw) / 60, 2),
          fundingFloorAprPct: annualizedFactorPercent(fundingFloorRaw),
          fundingBaseAprPct: annualizedFactorPercent(fundingBaseRaw),
          minFundingAprPct: annualizedFactorPercent(minFundingRaw),
          maxFundingAprPct: annualizedFactorPercent(maxFundingRaw),
          fundingUpdatedAt: Number(fundingUpdatedAtRaw),
          longOiTokens: round(Number(formatUnits(longOiTokensRaw, indexTokenDecimals)), 6),
          shortOiTokens: round(Number(formatUnits(shortOiTokensRaw, indexTokenDecimals)), 6),
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
    state.lpVaultUsdcBalance = lpVaultUsdcBalance;
    state.onchainMarkets = onchainMarkets;
    state.readStatus = onchainMarkets.length > 0 ? "mixed" : "live";
    return state;
  } catch (error) {
    console.warn("live monitor reads unavailable, using fallback snapshot", error);
    return state;
  }
}

function buildMarkets(riskRows: RiskCsvRow[], liveState: LiveReadState): { markets: MarketSnapshot[]; marketSeries: MarketSeries[] } {
  const riskBySymbol = new Map(riskRows.map((row) => [row.symbol, row]));
  const configuredBySymbol = new Map(basefx100Sepolia0312.markets.map((market) => [market.symbol, market]));
  const discovered = liveState.onchainMarkets.length > 0
    ? liveState.onchainMarkets
    : basefx100Sepolia0312.markets.map((market) => ({
        symbol: market.symbol,
        displayName: market.displayName,
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
        fundingFloorAprPct: 10.95,
        fundingBaseAprPct: 28,
        minFundingAprPct: -12,
        maxFundingAprPct: 140,
        fundingUpdatedAt: undefined,
        longOiTokens: 0,
        shortOiTokens: 0,
        maxOpenInterestLongUsd: market.maxPositionSizeUsd,
        maxOpenInterestShortUsd: market.maxPositionSizeUsd,
      }));

  const markets = discovered.map((marketState) => {
    const risk = riskBySymbol.get(marketState.symbol);
    const configured = configuredBySymbol.get(marketState.symbol);
    const seed = assetSeeds[marketState.symbol] ?? {
      price: 1,
      fundingApr: marketState.fundingBaseAprPct || 0,
      externalFundingApr: 0,
      skewPct: 0,
      oiChange24hPct: 0,
      oracleDriftPct: 0,
    };
    const riskScore = Number(risk?.Risk_Score ?? 5);
    const alertLevel = normalizeAlertLevel(risk?.Alert_Level ?? "Normal");
    const oraclePrice = round(seed.price * (1 - seed.oracleDriftPct / 100), marketState.symbol === "BTC" ? 2 : 4);
    const bidDepthUsd = marketState.bidDepthUsd > 0 && marketState.bidDepthUsd < 1_000_000_000 ? marketState.bidDepthUsd : (configured?.bidDepthUsd ?? 0);
    const askDepthUsd = marketState.askDepthUsd > 0 && marketState.askDepthUsd < 1_000_000_000 ? marketState.askDepthUsd : (configured?.askDepthUsd ?? 0);
    const maxPositionSizeUsd = marketState.maxPositionSizeUsd > 0 ? marketState.maxPositionSizeUsd : (configured?.maxPositionSizeUsd ?? 0);
    const positionFeeFactorPct = marketState.positionFeeFactorPct > 0 ? marketState.positionFeeFactorPct : round((configured?.positionFeeFactor ?? 0) * 100, 4);
    const priceImpactParameter = marketState.priceImpactParameter > 0 ? marketState.priceImpactParameter : (configured?.priceImpactParameter ?? 0);
    const minCollateralFactorPct = marketState.minCollateralFactorPct > 0 ? marketState.minCollateralFactorPct : round((configured?.minCollateralFactor ?? 0) * 100, 4);
    const minCollateralFactorForLiquidationPct = marketState.minCollateralFactorForLiquidationPct > 0 ? marketState.minCollateralFactorForLiquidationPct : round((configured?.minCollateralFactorForLiquidation ?? 0) * 100, 4);
    const fundingFloorAprPct = marketState.fundingFloorAprPct !== 0 ? marketState.fundingFloorAprPct : 10.95;
    const fundingBaseAprPct = marketState.fundingBaseAprPct !== 0 ? marketState.fundingBaseAprPct : seed.fundingApr;
    const minFundingAprPct = marketState.minFundingAprPct !== 0 ? marketState.minFundingAprPct : -12;
    const maxFundingAprPct = marketState.maxFundingAprPct !== 0 ? marketState.maxFundingAprPct : 140;
    const fundingSkewEmaMinutes = marketState.fundingSkewEmaMinutes > 0 ? marketState.fundingSkewEmaMinutes : 20;
    const poolCollateralAmount = marketState.poolCollateralAmount > 0 ? marketState.poolCollateralAmount : marketState.collateralVaultBalance;
    const longOpenInterestUsd = marketState.longOiTokens > 0 ? round(marketState.longOiTokens * seed.price, 2) : 0;
    const shortOpenInterestUsd = marketState.shortOiTokens > 0 ? round(marketState.shortOiTokens * seed.price, 2) : 0;
    const totalOiTokens = marketState.longOiTokens + marketState.shortOiTokens;
    const openInterestUsd = totalOiTokens > 0
      ? round(totalOiTokens * seed.price, 2)
      : round(Math.min(maxPositionSizeUsd * 0.58, askDepthUsd * 0.52 + bidDepthUsd * 0.48), 0);
    const longSharePct = totalOiTokens > 0
      ? round((marketState.longOiTokens / totalOiTokens) * 100, 1)
      : round(50 + seed.skewPct / 2, 1);
    const hasLiveOi = totalOiTokens > 0;
    const openInterestCapacityUsd = marketState.maxOpenInterestLongUsd + marketState.maxOpenInterestShortUsd > 0
      ? marketState.maxOpenInterestLongUsd + marketState.maxOpenInterestShortUsd
      : maxPositionSizeUsd * 2;
    const openInterestUtilizationPct = hasLiveOi && openInterestCapacityUsd > 0 ? round((openInterestUsd / openInterestCapacityUsd) * 100, 2) : 0;
    const poolUtilizationPct = hasLiveOi && poolCollateralAmount > 0 ? round((openInterestUsd / poolCollateralAmount) * 100, 2) : 0;
    const realizedVol1hPct = round(Number(risk?.VaR_P99_9 ?? 0.06) * 62, 2);
    const volLimitPct = round(Number(risk?.VaR_P99_9 ?? 0.06) * 82, 2);
    const fundingAprPct = fundingBaseAprPct;
    const skewPct = totalOiTokens > 0 ? round(longSharePct - (100 - longSharePct), 2) : seed.skewPct;

    return {
      symbol: marketState.symbol,
      displayName: marketState.displayName,
      marketIndex: marketState.marketIndex,
      vault: marketState.vault,
      indexToken: marketState.indexToken,
      collateralToken: marketState.collateralToken,
      tier: risk?.Recommended_Tier || risk?.Current_Tier || "Tier 2",
      alertLevel,
      watchStatus: watchStatusFromAlert(alertLevel),
      markPrice: seed.price,
      oraclePrice,
      priceDeviationPct: round(((seed.price - oraclePrice) / oraclePrice) * 100, 2),
      openInterestUsd,
      oiChange24hPct: seed.oiChange24hPct,
      fundingRateHourlyPct: round(fundingAprPct / (365 * 24), 4),
      fundingAprPct,
      externalFundingAprPct: seed.externalFundingApr,
      skewPct,
      longSharePct,
      shortSharePct: round(100 - longSharePct, 1),
      realizedVol1hPct,
      volLimitPct,
      riskScore: round(riskScore, 2),
      var99_9Pct: round(Number(risk?.VaR_P99_9 ?? 0.06) * 100, 2),
      es99_9Pct: round(Number(risk?.ES_P99_9 ?? 0.06) * 100, 2),
      tailRatio: round(Number(risk?.ES_VaR_Ratio_P99_9 ?? 1), 3),
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
      pinned: true,
    } satisfies MarketSnapshot;
  });

  const marketSeries = markets.map((market) => ({
    symbol: market.symbol,
    priceVolatility: shiftSeries(market.realizedVol1hPct, market.oiChange24hPct, 7, market.var99_9Pct).map((point) => ({ ...point, value: round(point.value, 2) })),
    fundingApr: shiftSeries(market.fundingAprPct, market.oiChange24hPct / 2, 7, Math.max(market.fundingAprPct, 1)).map((point) => ({ ...point, value: round(point.value, 2) })),
    openInterestUsd: shiftSeries(market.openInterestUsd, market.oiChange24hPct, 7, market.realizedVol1hPct).map((point) => ({ ...point, value: Math.round(point.value) })),
  }));

  return { markets, marketSeries };
}

function buildDashboard(markets: MarketSnapshot[], liveState: LiveReadState): DashboardOverview {
  const totalOi = markets.reduce((sum, market) => sum + market.openInterestUsd, 0);
  const weightedFunding = totalOi > 0 ? markets.reduce((sum, market) => sum + market.fundingAprPct * market.openInterestUsd, 0) / totalOi : 0;
  const avgOiChange = markets.length > 0 ? markets.reduce((sum, market) => sum + market.oiChange24hPct, 0) / markets.length : 0;
  const activeAlerts = markets.filter((market) => market.alertLevel !== "normal").length;
  const criticalAlerts = markets.filter((market) => market.alertLevel === "l3").length;
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
      delta: `${markets.filter((market) => market.fundingAprPct > market.externalFundingAprPct).length}/${markets.length} above venue`,
      tone: weightedFunding > 20 ? "warning" : "good",
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
          ? "RPC reads failed, so the monitor fell back to deterministic static values for runtime balances and market metadata."
          : `RPC live reads are active at block ${liveState.blockNumber}. Markets, vault balances, open interest, pool collateral, and key DataStore parameters are onchain values; VaR/ES analytics remain seeded.`,
      tone: liveState.readStatus === "fallback" ? "warning" : "good",
    },
    {
      title: "Config posture",
      body: `Global max oracle deviation ${basefx100Sepolia0312.globals.maxOracleRefPriceDeviationFactor}, price impact spread ${basefx100Sepolia0312.globals.maxPriceImpactSpread}.`,
      tone: "warning",
    },
  ];

  return {
    stats,
    exposureSeries: shiftSeries(totalOi || 1, avgOiChange, 7, 12).map((point) => ({ ...point, value: Math.round(point.value) })),
    priorityMarkets: [...markets].sort((left, right) => right.riskScore - left.riskScore),
    notes,
  };
}

function buildAlerts(markets: MarketSnapshot[]): { alerts: AlertRecord[]; actions: ActionRecord[]; recovery: RecoveryRecord[] } {
  const alerts = markets.map((market, index) => {
    const fundingSpread = round(market.fundingAprPct - market.externalFundingAprPct, 2);
    const capacityStress = market.openInterestUtilizationPct;
    const poolStress = market.poolUtilizationPct;

    let category = "Funding divergence";
    let description = `Funding APR at ${round(market.fundingAprPct, 1)}% is ${fundingSpread >= 0 ? "above" : "below"} venue baseline ${round(market.externalFundingAprPct, 1)}%.`;
    let metricValue = Math.abs(fundingSpread);
    let thresholdValue = 5;
    let actionSummary = "Validate oracle / venue spread and review funding coefficients";

    if (capacityStress >= 75) {
      category = "Open interest capacity";
      description = `Open interest is using ${capacityStress.toFixed(1)}% of configured capacity (${formatCurrency(market.openInterestUsd)} / ${formatCurrency(market.openInterestCapacityUsd)}).`;
      metricValue = capacityStress;
      thresholdValue = 75;
      actionSummary = "Tighten OI caps, review leverage limits, and monitor queue pressure";
    } else if (poolStress >= 80) {
      category = "Pool concentration";
      description = `Open interest is ${poolStress.toFixed(1)}% of collateral pool backing (${formatCurrency(market.openInterestUsd)} / ${formatCurrency(market.poolCollateralAmount)}).`;
      metricValue = poolStress;
      thresholdValue = 80;
      actionSummary = "Increase pool depth or reduce market caps before additional flow is accepted";
    } else if (market.realizedVol1hPct >= market.volLimitPct * 0.9) {
      category = "Volatility breach";
      description = `Realized 1h volatility at ${market.realizedVol1hPct}% is near the guard rail of ${market.volLimitPct}%.`;
      metricValue = market.realizedVol1hPct;
      thresholdValue = market.volLimitPct;
      actionSummary = "Increase observation cadence and validate venue spread";
    }

    return {
      id: `alert-${market.symbol.toLowerCase()}`,
      level: market.alertLevel,
      status: market.alertLevel === "l3" ? "active" : market.alertLevel === "l2" ? "investigating" : "monitoring",
      category,
      assetSymbol: market.symbol,
      title: `${market.symbol} ${watchStatusFromAlert(market.alertLevel)}`,
      description,
      triggeredAt: `${(index + 1) * 8}m ago`,
      metricValue,
      thresholdValue,
      actionSummary:
        market.alertLevel === "l3"
          ? "Cut leverage, tighten OI caps, raise emergency impact curve"
          : actionSummary,
    } satisfies AlertRecord;
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
  const [riskRows, liveState] = await Promise.all([loadRiskRows(), loadLiveState()]);
  const { markets, marketSeries } = buildMarkets(riskRows, liveState);
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
        ? "rpc live reads + DataStore market discovery + seeded analytics fallback"
        : "embedded market config + fallback seeded metrics",
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
