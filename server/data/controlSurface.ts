import { AbiCoder, Contract, JsonRpcProvider, Wallet, keccak256, parseUnits, toUtf8Bytes } from "ethers";
import type {
  ParameterFieldDefinition,
  ProtocolOpsFieldDefinition,
} from "../../shared/monitoring";
import { basefx100Sepolia0312 } from "../config/fx100";

const abiCoder = AbiCoder.defaultAbiCoder();
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const FACTOR_DECIMALS = 30;
const USD_DECIMALS = 30;

const CONFIG_ABI = [
  "function setUint(bytes32 baseKey, bytes data, uint256 value)",
  "function setBool(bytes32 baseKey, bytes data, bool value)",
];

type ValueEncoding =
  | "factor-percent"
  | "factor-ratio"
  | "annualized-factor-percent"
  | "usd"
  | "uint"
  | "seconds"
  | "minutes-to-seconds"
  | "bool";

type ScopeKind = "global" | "market" | "market-bool";
type HashMode = "abi" | "raw";

export type ControlSurface = "parameters" | "protocol-ops";

export interface FieldDefinitionMeta {
  keyName: string;
  keyPath: string;
  writable: boolean;
  writableReason?: string;
}

interface WritableFieldControl extends FieldDefinitionMeta {
  surface: ControlSurface;
  hashMode: HashMode;
  scope: ScopeKind;
  setter: "uint" | "bool";
  baseKeyName: string;
  valueEncoding?: ValueEncoding;
  fixedBool?: boolean;
}

export interface MonitoringControlUpdateInput {
  surface: ControlSurface;
  fieldKey: string;
  symbol?: string;
  value: string | number | boolean;
}

export interface MonitoringControlUpdateResult {
  ok: true;
  txHash: string;
  surface: ControlSurface;
  fieldKey: string;
  symbol?: string;
  keyName: string;
  keyPath: string;
}

function abiKey(name: string) {
  return keccak256(abiCoder.encode(["string"], [name]));
}

function rawKey(name: string) {
  return keccak256(toUtf8Bytes(name));
}

function baseKeyFor(control: WritableFieldControl) {
  return control.hashMode === "raw" ? rawKey(control.baseKeyName) : abiKey(control.baseKeyName);
}

function encodeScopeData(control: WritableFieldControl, marketIndex?: number) {
  if (control.scope === "global") return "0x";
  if (marketIndex == null) throw new Error("marketIndex is required for market-scoped updates");
  if (control.scope === "market") {
    return abiCoder.encode(["uint256"], [BigInt(marketIndex)]);
  }
  return abiCoder.encode(["uint256", "bool"], [BigInt(marketIndex), control.fixedBool === true]);
}

function normalizeBoolean(value: string | number | boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["false", "0", "no", "off", "disabled"].includes(normalized)) return false;
  throw new Error(`invalid boolean value: ${value}`);
}

function normalizeNumberText(value: string | number | boolean) {
  if (typeof value === "boolean") {
    throw new Error("boolean value is not valid for numeric field");
  }
  const text = String(value).trim();
  if (!text) throw new Error("empty numeric value");
  return text;
}

function encodeUintValue(control: WritableFieldControl, value: string | number | boolean) {
  const text = normalizeNumberText(value);
  switch (control.valueEncoding) {
    case "factor-percent":
      return parseUnits(text, FACTOR_DECIMALS - 2);
    case "factor-ratio":
      return parseUnits(text, FACTOR_DECIMALS);
    case "annualized-factor-percent":
      return parseUnits(text, FACTOR_DECIMALS - 2) / BigInt(YEAR_SECONDS);
    case "usd":
      return parseUnits(text, USD_DECIMALS);
    case "minutes-to-seconds":
      return BigInt(Math.round(Number(text) * 60));
    case "seconds":
    case "uint":
    default:
      return BigInt(Math.round(Number(text)));
  }
}

function getWriterPrivateKey() {
  return process.env.FX100_MONITOR_WRITE_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY || process.env.TEST_PRIVATE_KEY || "";
}

export function isWriteEnabled() {
  return getWriterPrivateKey().length > 0;
}

const parameterControlMap: Record<string, WritableFieldControl> = {
  openFeeRatio: { surface: "parameters", keyName: "FX100Keys.POSITION_FEE_FACTOR", keyPath: "FX100Keys.positionFeeFactorKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "POSITION_FEE_FACTOR", valueEncoding: "factor-percent" },
  closeFeeRatio: { surface: "parameters", keyName: "FX100Keys.POSITION_FEE_FACTOR", keyPath: "FX100Keys.positionFeeFactorKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "POSITION_FEE_FACTOR", valueEncoding: "factor-percent" },
  constantSpread: { surface: "parameters", keyName: "FX100Keys.CONSTANT_PRICE_SPREAD", keyPath: "FX100Keys.constantPriceSpreadKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "CONSTANT_PRICE_SPREAD", valueEncoding: "factor-percent" },
  liquidationFeeFactor: { surface: "parameters", keyName: "FX100Keys.LIQUIDATION_FEE_FACTOR", keyPath: "FX100Keys.liquidationFeeFactorKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "LIQUIDATION_FEE_FACTOR", valueEncoding: "factor-percent" },
  maxPriceDeviation: { surface: "parameters", keyName: "FX100Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR", keyPath: "FX100Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR", valueEncoding: "factor-percent" },
  priceImpactNormal: { surface: "parameters", keyName: "FX100Keys.PRICE_IMPACT_PARAMETER", keyPath: "FX100Keys.priceImpactParameterKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "PRICE_IMPACT_PARAMETER", valueEncoding: "factor-ratio" },
  priceImpactEmergency: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor from priceImpactNormal; no direct FX100Keys storage slot.", writable: false, writableReason: "Derived display value, not a stored config key.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "PRICE_IMPACT_PARAMETER" },
  maxPriceImpactSpread: { surface: "parameters", keyName: "FX100Keys.MAX_PRICE_IMPACT_SPREAD", keyPath: "FX100Keys.MAX_PRICE_IMPACT_SPREAD", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_PRICE_IMPACT_SPREAD", valueEncoding: "factor-percent" },
  positionImpactFactorPositive: { surface: "parameters", keyName: "FX100Keys.POSITION_IMPACT_FACTOR", keyPath: "FX100Keys.positionImpactFactorKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "POSITION_IMPACT_FACTOR", fixedBool: true, valueEncoding: "factor-ratio" },
  positionImpactFactorNegative: { surface: "parameters", keyName: "FX100Keys.POSITION_IMPACT_FACTOR", keyPath: "FX100Keys.positionImpactFactorKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "POSITION_IMPACT_FACTOR", fixedBool: false, valueEncoding: "factor-ratio" },
  positionImpactExponentPositive: { surface: "parameters", keyName: "FX100Keys.POSITION_IMPACT_EXPONENT_FACTOR", keyPath: "FX100Keys.positionImpactExponentFactorKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "POSITION_IMPACT_EXPONENT_FACTOR", fixedBool: true, valueEncoding: "factor-ratio" },
  positionImpactExponentNegative: { surface: "parameters", keyName: "FX100Keys.POSITION_IMPACT_EXPONENT_FACTOR", keyPath: "FX100Keys.positionImpactExponentFactorKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "POSITION_IMPACT_EXPONENT_FACTOR", fixedBool: false, valueEncoding: "factor-ratio" },
  maxPositionImpactFactorPositive: { surface: "parameters", keyName: "FX100Keys.MAX_POSITION_IMPACT_FACTOR", keyPath: "FX100Keys.maxPositionImpactFactorKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "MAX_POSITION_IMPACT_FACTOR", fixedBool: true, valueEncoding: "factor-percent" },
  maxPositionImpactFactorNegative: { surface: "parameters", keyName: "FX100Keys.MAX_POSITION_IMPACT_FACTOR", keyPath: "FX100Keys.maxPositionImpactFactorKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "MAX_POSITION_IMPACT_FACTOR", fixedBool: false, valueEncoding: "factor-percent" },
  piClampMin: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_SKEW_IMPACT" },
  piClampMax: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_SKEW_IMPACT" },
  maxLev: { surface: "parameters", keyName: "Template", keyPath: "Template-only leverage hint. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Monitor currently does not map max leverage to an onchain key.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_POSITION_SIZE_USD" },
  minPosUsd: { surface: "parameters", keyName: "FX100Keys.MIN_POSITION_SIZE_USD", keyPath: "FX100Keys.minPositionSizeUsdKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_POSITION_SIZE_USD", valueEncoding: "usd" },
  minCollateralUsd: { surface: "parameters", keyName: "FX100Keys.MIN_COLLATERAL_USD", keyPath: "FX100Keys.minCollateralUsdKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_COLLATERAL_USD", valueEncoding: "usd" },
  singlePosCap: { surface: "parameters", keyName: "Template", keyPath: "Derived UI ratio. No direct FX100Keys slot.", writable: false, writableReason: "Derived from template only.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_POSITION_SIZE_USD" },
  globalCap: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor; no direct FX100Keys slot.", writable: false, writableReason: "Derived display value.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_POSITION_SIZE_USD" },
  singlePosCapUsd: { surface: "parameters", keyName: "FX100Keys.MAX_POSITION_SIZE_USD", keyPath: "FX100Keys.maxPositionSizeUsdKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_POSITION_SIZE_USD", valueEncoding: "usd" },
  globalCapUsd: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor as singlePosCapUsd * 4.", writable: false, writableReason: "Derived display value.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_POSITION_SIZE_USD" },
  maxOpenInterestFactorLong: { surface: "parameters", keyName: "FX100Keys.MAX_OPEN_INTEREST_FACTOR", keyPath: "FX100Keys.maxOpenInterestFactorKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "MAX_OPEN_INTEREST_FACTOR", fixedBool: true, valueEncoding: "factor-percent" },
  maxOpenInterestFactorShort: { surface: "parameters", keyName: "FX100Keys.MAX_OPEN_INTEREST_FACTOR", keyPath: "FX100Keys.maxOpenInterestFactorKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "MAX_OPEN_INTEREST_FACTOR", fixedBool: false, valueEncoding: "factor-percent" },
  openCooldownSec: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_POSITION_SIZE_USD" },
  reserveFactor: { surface: "parameters", keyName: "Derived", keyPath: "Derived average of reserveFactorLong and reserveFactorShort.", writable: false, writableReason: "Average display value, not a single storage key.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "RESERVE_FACTOR" },
  reserveFactorLong: { surface: "parameters", keyName: "FX100Keys.RESERVE_FACTOR", keyPath: "FX100Keys.reserveFactorKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "RESERVE_FACTOR", fixedBool: true, valueEncoding: "factor-percent" },
  reserveFactorShort: { surface: "parameters", keyName: "FX100Keys.RESERVE_FACTOR", keyPath: "FX100Keys.reserveFactorKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "RESERVE_FACTOR", fixedBool: false, valueEncoding: "factor-percent" },
  oiReserveFactorLong: { surface: "parameters", keyName: "FX100Keys.OPEN_INTEREST_RESERVE_FACTOR", keyPath: "FX100Keys.openInterestReserveFactorKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "OPEN_INTEREST_RESERVE_FACTOR", fixedBool: true, valueEncoding: "factor-percent" },
  oiReserveFactorShort: { surface: "parameters", keyName: "FX100Keys.OPEN_INTEREST_RESERVE_FACTOR", keyPath: "FX100Keys.openInterestReserveFactorKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "OPEN_INTEREST_RESERVE_FACTOR", fixedBool: false, valueEncoding: "factor-percent" },
  minCollateralFactor: { surface: "parameters", keyName: "FX100Keys.MIN_COLLATERAL_FACTOR", keyPath: "FX100Keys.minCollateralFactorKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_COLLATERAL_FACTOR", valueEncoding: "factor-percent" },
  minCollateralFactorForOIMultiplierLong: { surface: "parameters", keyName: "FX100Keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER", keyPath: "FX100Keys.minCollateralFactorForOpenInterestMultiplierKey(marketIndex, true)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER", fixedBool: true, valueEncoding: "factor-percent" },
  minCollateralFactorForOIMultiplierShort: { surface: "parameters", keyName: "FX100Keys.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER", keyPath: "FX100Keys.minCollateralFactorForOpenInterestMultiplierKey(marketIndex, false)", writable: true, hashMode: "abi", scope: "market-bool", setter: "uint", baseKeyName: "MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER", fixedBool: false, valueEncoding: "factor-percent" },
  riskThreshold: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_COLLATERAL_FACTOR" },
  targetRiskRatio: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_COLLATERAL_FACTOR" },
  fundingFloorApr: { surface: "parameters", keyName: "FX100Keys.FUNDING_FLOOR_FACTOR", keyPath: "FX100Keys.fundingFloorFactorKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "FUNDING_FLOOR_FACTOR", valueEncoding: "annualized-factor-percent" },
  fundingBaseApr: { surface: "parameters", keyName: "FX100Keys.FUNDING_BASE_FACTOR", keyPath: "FX100Keys.fundingBaseFactorKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "FUNDING_BASE_FACTOR", valueEncoding: "annualized-factor-percent" },
  fundingEmergencyApr: { surface: "parameters", keyName: "FX100Keys.MAX_FUNDING_FACTOR_PER_SECOND", keyPath: "FX100Keys.maxFundingFactorPerSecondKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_FUNDING_FACTOR_PER_SECOND", valueEncoding: "annualized-factor-percent" },
  minFundingRate: { surface: "parameters", keyName: "FX100Keys.MIN_FUNDING_FACTOR_PER_SECOND", keyPath: "FX100Keys.minFundingFactorPerSecondKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MIN_FUNDING_FACTOR_PER_SECOND", valueEncoding: "annualized-factor-percent" },
  maxFundingRate: { surface: "parameters", keyName: "FX100Keys.MAX_FUNDING_FACTOR_PER_SECOND", keyPath: "FX100Keys.maxFundingFactorPerSecondKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_FUNDING_FACTOR_PER_SECOND", valueEncoding: "annualized-factor-percent" },
  skewEmaMinutes: { surface: "parameters", keyName: "FX100Keys.FUNDING_SKEW_EMA", keyPath: "FX100Keys.fundingSkewEmaKey(marketIndex) [packed runtime state]", writable: false, writableReason: "Packed runtime state; monitor does not edit it directly.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "FUNDING_SKEW_EMA" },
  skewImpactFactor: { surface: "parameters", keyName: "FX100Keys.SKEW_IMPACT_FACTOR", keyPath: "FX100Keys.SKEW_IMPACT_FACTOR", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "SKEW_IMPACT_FACTOR", valueEncoding: "factor-ratio" },
  skewKNormal: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "SKEW_IMPACT_FACTOR" },
  skewKEmergency: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "SKEW_IMPACT_FACTOR" },
  skewClampLiveMin: { surface: "parameters", keyName: "FX100Keys.MIN_SKEW_IMPACT", keyPath: "FX100Keys.MIN_SKEW_IMPACT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MIN_SKEW_IMPACT", valueEncoding: "factor-ratio" },
  skewClampLiveMax: { surface: "parameters", keyName: "FX100Keys.MAX_SKEW_IMPACT", keyPath: "FX100Keys.MAX_SKEW_IMPACT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_SKEW_IMPACT", valueEncoding: "factor-ratio" },
  skewClampMin: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MIN_SKEW_IMPACT" },
  skewClampMax: { surface: "parameters", keyName: "Template", keyPath: "Template-only display field. No direct FX100Keys slot is wired in monitor.", writable: false, writableReason: "Template field only.", hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_SKEW_IMPACT" },
  orderbookDepthLong: { surface: "parameters", keyName: "FX100Keys.ASK_ORDER_BOOK_DEPTH", keyPath: "FX100Keys.askOrderBookDepthKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "ASK_ORDER_BOOK_DEPTH", valueEncoding: "usd" },
  orderbookDepthShort: { surface: "parameters", keyName: "FX100Keys.BID_ORDER_BOOK_DEPTH", keyPath: "FX100Keys.bidOrderBookDepthKey(marketIndex)", writable: true, hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "BID_ORDER_BOOK_DEPTH", valueEncoding: "usd" },
  minOrderbookDepthLong: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor from orderbookDepthLong * 0.72.", writable: false, writableReason: "Derived display value.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "ASK_ORDER_BOOK_DEPTH" },
  minOrderbookDepthShort: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor from orderbookDepthShort * 0.72.", writable: false, writableReason: "Derived display value.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "BID_ORDER_BOOK_DEPTH" },
  maxOrderbookDepthLong: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor from orderbookDepthLong * 1.22.", writable: false, writableReason: "Derived display value.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "ASK_ORDER_BOOK_DEPTH" },
  maxOrderbookDepthShort: { surface: "parameters", keyName: "Derived", keyPath: "Derived in monitor from orderbookDepthShort * 1.22.", writable: false, writableReason: "Derived display value.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "BID_ORDER_BOOK_DEPTH" },
  graceEnabled: { surface: "parameters", keyName: "FX100Keys.LIQUIDATION_GRACE_PERIOD_BASE", keyPath: "graceEnabled is inferred from FX100Keys.liquidationGracePeriodBaseKey(marketIndex) > 0.", writable: false, writableReason: "Derived from graceBaseMinutes > 0.", hashMode: "raw", scope: "market", setter: "uint", baseKeyName: "LIQUIDATION_GRACE_PERIOD_BASE" },
  graceBaseMinutes: { surface: "parameters", keyName: "FX100Keys.LIQUIDATION_GRACE_PERIOD_BASE", keyPath: "FX100Keys.liquidationGracePeriodBaseKey(marketIndex)", writable: true, hashMode: "raw", scope: "market", setter: "uint", baseKeyName: "LIQUIDATION_GRACE_PERIOD_BASE", valueEncoding: "minutes-to-seconds" },
  graceMaxMinutes: { surface: "parameters", keyName: "FX100Keys.LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER", keyPath: "graceMaxMinutes is not a direct stored field; effective grace depends on LIQUIDATION_GRACE_PERIOD_BASE * LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER(tier).", writable: false, writableReason: "Computed effective value, not a single config slot.", hashMode: "raw", scope: "market", setter: "uint", baseKeyName: "LIQUIDATION_GRACE_PERIOD_TIER_MULTIPLIER" },
  lpNavUsd: { surface: "parameters", keyName: "Vault balance", keyPath: "Read from LP vault token balance, not a config key.", writable: false, writableReason: "Observed state, not config.", hashMode: "abi", scope: "market", setter: "uint", baseKeyName: "MAX_POSITION_SIZE_USD" },
};

const protocolOpsControlMap: Record<string, WritableFieldControl> = {
  minOracleSigners: { surface: "protocol-ops", keyName: "FX100Keys.MIN_ORACLE_SIGNERS", keyPath: "FX100Keys.MIN_ORACLE_SIGNERS", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MIN_ORACLE_SIGNERS", valueEncoding: "uint" },
  minOracleBlockConfirmations: { surface: "protocol-ops", keyName: "FX100Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS", keyPath: "FX100Keys.MIN_ORACLE_BLOCK_CONFIRMATIONS", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MIN_ORACLE_BLOCK_CONFIRMATIONS", valueEncoding: "uint" },
  maxOraclePriceAgeSec: { surface: "protocol-ops", keyName: "FX100Keys.MAX_ORACLE_PRICE_AGE", keyPath: "FX100Keys.MAX_ORACLE_PRICE_AGE", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_ORACLE_PRICE_AGE", valueEncoding: "seconds" },
  maxAtomicOraclePriceAgeSec: { surface: "protocol-ops", keyName: "FX100Keys.MAX_ATOMIC_ORACLE_PRICE_AGE", keyPath: "FX100Keys.MAX_ATOMIC_ORACLE_PRICE_AGE", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_ATOMIC_ORACLE_PRICE_AGE", valueEncoding: "seconds" },
  maxOracleTimestampRangeSec: { surface: "protocol-ops", keyName: "FX100Keys.MAX_ORACLE_TIMESTAMP_RANGE", keyPath: "FX100Keys.MAX_ORACLE_TIMESTAMP_RANGE", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_ORACLE_TIMESTAMP_RANGE", valueEncoding: "seconds" },
  sequencerGraceDurationSec: { surface: "protocol-ops", keyName: "FX100Keys.SEQUENCER_GRACE_DURATION", keyPath: "FX100Keys.SEQUENCER_GRACE_DURATION", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "SEQUENCER_GRACE_DURATION", valueEncoding: "seconds" },
  maxOracleRefPriceDeviationPct: { surface: "protocol-ops", keyName: "FX100Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR", keyPath: "FX100Keys.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR", valueEncoding: "factor-percent" },
  createDepositGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.CREATE_DEPOSIT_GAS_LIMIT", keyPath: "FX100Keys.CREATE_DEPOSIT_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "CREATE_DEPOSIT_GAS_LIMIT", valueEncoding: "uint" },
  depositGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.DEPOSIT_GAS_LIMIT", keyPath: "FX100Keys.DEPOSIT_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "DEPOSIT_GAS_LIMIT", valueEncoding: "uint" },
  createWithdrawalGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.CREATE_WITHDRAWAL_GAS_LIMIT", keyPath: "FX100Keys.CREATE_WITHDRAWAL_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "CREATE_WITHDRAWAL_GAS_LIMIT", valueEncoding: "uint" },
  withdrawalGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.WITHDRAWAL_GAS_LIMIT", keyPath: "FX100Keys.WITHDRAWAL_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "WITHDRAWAL_GAS_LIMIT", valueEncoding: "uint" },
  singleSwapGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.SINGLE_SWAP_GAS_LIMIT", keyPath: "FX100Keys.SINGLE_SWAP_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "SINGLE_SWAP_GAS_LIMIT", valueEncoding: "uint" },
  increaseOrderGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.INCREASE_ORDER_GAS_LIMIT", keyPath: "FX100Keys.INCREASE_ORDER_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "INCREASE_ORDER_GAS_LIMIT", valueEncoding: "uint" },
  decreaseOrderGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.DECREASE_ORDER_GAS_LIMIT", keyPath: "FX100Keys.DECREASE_ORDER_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "DECREASE_ORDER_GAS_LIMIT", valueEncoding: "uint" },
  swapOrderGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.SWAP_ORDER_GAS_LIMIT", keyPath: "FX100Keys.SWAP_ORDER_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "SWAP_ORDER_GAS_LIMIT", valueEncoding: "uint" },
  tokenTransferGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.TOKEN_TRANSFER_GAS_LIMIT", keyPath: "FX100Keys.TOKEN_TRANSFER_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "TOKEN_TRANSFER_GAS_LIMIT", valueEncoding: "uint" },
  nativeTokenTransferGasLimit: { surface: "protocol-ops", keyName: "FX100Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT", keyPath: "FX100Keys.NATIVE_TOKEN_TRANSFER_GAS_LIMIT", writable: true, hashMode: "abi", scope: "global", setter: "uint", baseKeyName: "NATIVE_TOKEN_TRANSFER_GAS_LIMIT", valueEncoding: "uint" },
  createOrderDisabled: { surface: "protocol-ops", keyName: "FX100Keys.CREATE_ORDER_FEATURE_DISABLED", keyPath: "FX100Keys.CREATE_ORDER_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "CREATE_ORDER_FEATURE_DISABLED", valueEncoding: "bool" },
  executeOrderDisabled: { surface: "protocol-ops", keyName: "FX100Keys.EXECUTE_ORDER_FEATURE_DISABLED", keyPath: "FX100Keys.EXECUTE_ORDER_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "EXECUTE_ORDER_FEATURE_DISABLED", valueEncoding: "bool" },
  updateOrderDisabled: { surface: "protocol-ops", keyName: "FX100Keys.UPDATE_ORDER_FEATURE_DISABLED", keyPath: "FX100Keys.UPDATE_ORDER_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "UPDATE_ORDER_FEATURE_DISABLED", valueEncoding: "bool" },
  cancelOrderDisabled: { surface: "protocol-ops", keyName: "FX100Keys.CANCEL_ORDER_FEATURE_DISABLED", keyPath: "FX100Keys.CANCEL_ORDER_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "CANCEL_ORDER_FEATURE_DISABLED", valueEncoding: "bool" },
  createDepositDisabled: { surface: "protocol-ops", keyName: "FX100Keys.CREATE_DEPOSIT_FEATURE_DISABLED", keyPath: "FX100Keys.CREATE_DEPOSIT_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "CREATE_DEPOSIT_FEATURE_DISABLED", valueEncoding: "bool" },
  executeDepositDisabled: { surface: "protocol-ops", keyName: "FX100Keys.EXECUTE_DEPOSIT_FEATURE_DISABLED", keyPath: "FX100Keys.EXECUTE_DEPOSIT_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "EXECUTE_DEPOSIT_FEATURE_DISABLED", valueEncoding: "bool" },
  createWithdrawalDisabled: { surface: "protocol-ops", keyName: "FX100Keys.CREATE_WITHDRAWAL_FEATURE_DISABLED", keyPath: "FX100Keys.CREATE_WITHDRAWAL_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "CREATE_WITHDRAWAL_FEATURE_DISABLED", valueEncoding: "bool" },
  executeWithdrawalDisabled: { surface: "protocol-ops", keyName: "FX100Keys.EXECUTE_WITHDRAWAL_FEATURE_DISABLED", keyPath: "FX100Keys.EXECUTE_WITHDRAWAL_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "EXECUTE_WITHDRAWAL_FEATURE_DISABLED", valueEncoding: "bool" },
  subaccountDisabled: { surface: "protocol-ops", keyName: "FX100Keys.SUBACCOUNT_FEATURE_DISABLED", keyPath: "FX100Keys.SUBACCOUNT_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "SUBACCOUNT_FEATURE_DISABLED", valueEncoding: "bool" },
  gaslessDisabled: { surface: "protocol-ops", keyName: "FX100Keys.GASLESS_FEATURE_DISABLED", keyPath: "FX100Keys.GASLESS_FEATURE_DISABLED", writable: true, hashMode: "abi", scope: "global", setter: "bool", baseKeyName: "GASLESS_FEATURE_DISABLED", valueEncoding: "bool" },
};

function metaFor(control: WritableFieldControl | undefined): FieldDefinitionMeta {
  if (!control) {
    return {
      keyName: "Unmapped",
      keyPath: "Monitor does not currently map this field to a specific FX100 key.",
      writable: false,
      writableReason: "No write mapping available.",
    };
  }
  return {
    keyName: control.keyName,
    keyPath: control.keyPath,
    writable: control.writable,
    writableReason: control.writableReason,
  };
}

export function decorateParameterDefinition(definition: ParameterFieldDefinition): ParameterFieldDefinition {
  return { ...definition, ...metaFor(parameterControlMap[definition.key]) };
}

export function decorateProtocolOpsDefinition(definition: ProtocolOpsFieldDefinition): ProtocolOpsFieldDefinition {
  return { ...definition, ...metaFor(protocolOpsControlMap[definition.key]) };
}

function resolveControl(input: MonitoringControlUpdateInput) {
  const control = input.surface === "parameters"
    ? parameterControlMap[input.fieldKey]
    : protocolOpsControlMap[input.fieldKey];
  if (!control) throw new Error(`unmapped field: ${input.fieldKey}`);
  if (!control.writable) throw new Error(control.writableReason || `${input.fieldKey} is not writable`);
  return control;
}

export async function applyMonitoringControlUpdate(input: MonitoringControlUpdateInput): Promise<MonitoringControlUpdateResult> {
  const control = resolveControl(input);
  const privateKey = getWriterPrivateKey();
  if (!privateKey) {
    throw new Error("writes are disabled: set FX100_MONITOR_WRITE_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) in the monitor runtime");
  }

  const provider = new JsonRpcProvider(basefx100Sepolia0312.rpcUrl);
  const signer = new Wallet(privateKey, provider);
  const config = new Contract(basefx100Sepolia0312.contracts.CONFIG, CONFIG_ABI, signer);
  const market = input.symbol ? basefx100Sepolia0312.markets.find((item) => item.symbol === input.symbol) : undefined;
  if (control.scope !== "global" && !market) {
    throw new Error(`symbol is required for ${control.surface} field ${input.fieldKey}`);
  }

  const data = encodeScopeData(control, market?.marketIndex);
  const baseKey = baseKeyFor(control);
  const tx = control.setter === "bool"
    ? await config.setBool(baseKey, data, normalizeBoolean(input.value))
    : await config.setUint(baseKey, data, encodeUintValue(control, input.value));

  await tx.wait();
  return {
    ok: true,
    txHash: tx.hash,
    surface: input.surface,
    fieldKey: input.fieldKey,
    symbol: input.symbol,
    keyName: control.keyName,
    keyPath: control.keyPath,
  };
}
