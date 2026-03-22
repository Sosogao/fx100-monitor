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
  DistributionRegistrySection,
  EnvironmentInfo,
  MarketSeries,
  MarketSnapshot,
  MetricPoint,
  MonitoringSnapshot,
  ParameterFieldDefinition,
  ProtocolOpsFieldDefinition,
  ProtocolOpsSnapshot,
  DistributionOpsFieldDefinition,
  DistributionOpsSnapshot,
  ParameterSnapshot,
  ParameterSourceSet,
  ParameterValueSet,
  RecoveryRecord,
} from "../../shared/monitoring";
import { basefx100Sepolia0312 } from "../config/fx100";
import { decorateParameterDefinition, decorateProtocolOpsDefinition, isWriteEnabled } from "./controlSurface";

const projectRoot = process.cwd();

const abiCoder = AbiCoder.defaultAbiCoder();
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const FACTOR_DECIMALS = 30;
const USD_DECIMALS = 30;
const TOKEN_PRECISION = 1e30;

const DATA_STORE_ABI = [
  "function getUint(bytes32 key) view returns (uint256)",
  "function getInt(bytes32 key) view returns (int256)",
  "function getBytes32(bytes32 key) view returns (bytes32)",
  "function getAddress(bytes32 key) view returns (address)",
  "function getBool(bytes32 key) view returns (bool)",
  "function getAddressArray(bytes32 key) view returns (address[])",
  "function getUintArray(bytes32 key) view returns (uint256[])",
  "function getBoolArray(bytes32 key) view returns (bool[])",
  "function getUintCount(bytes32 setKey) view returns (uint256)",
  "function getUintValuesAt(bytes32 setKey, uint256 start, uint256 end) view returns (uint256[])",
  "function getBytes32Count(bytes32 setKey) view returns (uint256)",
  "function getBytes32ValuesAt(bytes32 setKey, uint256 start, uint256 end) view returns (bytes32[])",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const ORACLE_ABI = [
  "function getPrimaryPrice(address token) view returns ((uint256 min,uint256 max))",
];

const READER_ABI = [
  "function getMarketInfo(address dataStore, ((uint256 min,uint256 max) indexTokenPrice,(uint256 min,uint256 max) collateralTokenPrice) prices, uint256 marketIndex) view returns (((uint256 marketIndex,address vault,address indexToken,address collateralToken) market,((uint256 long,uint256 short) negativeFundingFeePerSize,(uint256 long,uint256 short) positiveFundingFeePerSize) baseFunding,(int256 longFundingFactorPerSecond,int256 shortFundingFactorPerSecond,(uint256 long,uint256 short) negativeFundingFeePerSizeDelta,(uint256 long,uint256 short) positiveFundingFeePerSizeDelta,(uint40 lastTime,uint24 sampleInterval,int96 lastValue,int96 lastEmaValue) skewEMA,int256 positionPaysLp) nextFunding,uint256 poolUsdWithoutPnl,uint256 reservedUsdLong,uint256 reservedUsdShort,int256 longPnlToPoolFactor,int256 shortPnlToPoolFactor,uint256 availableLongUsd,uint256 availableShortUsd,bool isDisabled) marketInfo)",
];

const dataStoreInterface = new Interface(DATA_STORE_ABI);

const DATA_KEYS = {
  MARKET_LIST: keyFromString("MARKET_LIST"),
  POSITION_FEE_FACTOR: keyFromString("POSITION_FEE_FACTOR"),
  CONSTANT_PRICE_SPREAD: keyFromString("CONSTANT_PRICE_SPREAD"),
  POSITION_IMPACT_FACTOR: keyFromString("POSITION_IMPACT_FACTOR"),
  POSITION_IMPACT_EXPONENT_FACTOR: keyFromString("POSITION_IMPACT_EXPONENT_FACTOR"),
  MAX_POSITION_IMPACT_FACTOR: keyFromString("MAX_POSITION_IMPACT_FACTOR"),
  PRICE_IMPACT_PARAMETER: keyFromString("PRICE_IMPACT_PARAMETER"),
  MAX_PRICE_IMPACT_SPREAD: keyFromString("MAX_PRICE_IMPACT_SPREAD"),
  BID_ORDER_BOOK_DEPTH: keyFromString("BID_ORDER_BOOK_DEPTH"),
  ASK_ORDER_BOOK_DEPTH: keyFromString("ASK_ORDER_BOOK_DEPTH"),
  OPEN_INTEREST_IN_TOKENS: keyFromString("OPEN_INTEREST_IN_TOKENS"),
  POOL_AMOUNT: keyFromString("POOL_AMOUNT"),
  MAX_OPEN_INTEREST: keyFromString("MAX_OPEN_INTEREST"),
  CUMULATIVE_OPEN_COSTS: keyFromString("CUMULATIVE_OPEN_COSTS"),
  MAX_OPEN_INTEREST_FACTOR: keyFromString("MAX_OPEN_INTEREST_FACTOR"),
  RESERVE_FACTOR: keyFromString("RESERVE_FACTOR"),
  OPEN_INTEREST_RESERVE_FACTOR: keyFromString("OPEN_INTEREST_RESERVE_FACTOR"),
  NEGATIVE_FUNDING_FEE_PER_SIZE: keyFromString("NEGATIVE_FUNDING_FEE_PER_SIZE"),
  POSITIVE_FUNDING_FEE_PER_SIZE: keyFromString("POSITIVE_FUNDING_FEE_PER_SIZE"),
  FUNDING_SKEW_EMA: keyFromString("FUNDING_SKEW_EMA"),
  FUNDING_FLOOR_FACTOR: keyFromString("FUNDING_FLOOR_FACTOR"),
  FUNDING_BASE_FACTOR: keyFromString("FUNDING_BASE_FACTOR"),
  MIN_FUNDING_FACTOR_PER_SECOND: keyFromString("MIN_FUNDING_FACTOR_PER_SECOND"),
  MAX_FUNDING_FACTOR_PER_SECOND: keyFromString("MAX_FUNDING_FACTOR_PER_SECOND"),
  FUNDING_UPDATED_AT: keyFromString("FUNDING_UPDATED_AT"),
  MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR: keyFromString("MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR"),
  MIN_ORACLE_SIGNERS: keyFromString("MIN_ORACLE_SIGNERS"),
  MIN_ORACLE_BLOCK_CONFIRMATIONS: keyFromString("MIN_ORACLE_BLOCK_CONFIRMATIONS"),
  MAX_ORACLE_PRICE_AGE: keyFromString("MAX_ORACLE_PRICE_AGE"),
  MAX_ATOMIC_ORACLE_PRICE_AGE: keyFromString("MAX_ATOMIC_ORACLE_PRICE_AGE"),
  MAX_ORACLE_TIMESTAMP_RANGE: keyFromString("MAX_ORACLE_TIMESTAMP_RANGE"),
  SEQUENCER_GRACE_DURATION: keyFromString("SEQUENCER_GRACE_DURATION"),
  SKEW_IMPACT_FACTOR: keyFromString("SKEW_IMPACT_FACTOR"),
  MIN_SKEW_IMPACT: keyFromString("MIN_SKEW_IMPACT"),
  MAX_SKEW_IMPACT: keyFromString("MAX_SKEW_IMPACT"),
  MIN_COLLATERAL_FACTOR: keyFromString("MIN_COLLATERAL_FACTOR"),
  MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER: keyFromString("MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER"),
  MIN_COLLATERAL_USD: keyFromString("MIN_COLLATERAL_USD"),
  MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION: keyFromString("MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION"),
  MIN_POSITION_SIZE_USD: keyFromString("MIN_POSITION_SIZE_USD"),
  MAX_POSITION_SIZE_USD: keyFromString("MAX_POSITION_SIZE_USD"),
  LIQUIDATION_GRACE_PERIOD_BASE: keyFromString("LIQUIDATION_GRACE_PERIOD_BASE"),
  LIQUIDATION_FEE_FACTOR: keyFromString("LIQUIDATION_FEE_FACTOR"),
  POSITION_LIST: keyFromString("POSITION_LIST"),
  CREATE_ORDER_FEATURE_DISABLED: keyFromString("CREATE_ORDER_FEATURE_DISABLED"),
  EXECUTE_ORDER_FEATURE_DISABLED: keyFromString("EXECUTE_ORDER_FEATURE_DISABLED"),
  UPDATE_ORDER_FEATURE_DISABLED: keyFromString("UPDATE_ORDER_FEATURE_DISABLED"),
  CANCEL_ORDER_FEATURE_DISABLED: keyFromString("CANCEL_ORDER_FEATURE_DISABLED"),
  CREATE_DEPOSIT_FEATURE_DISABLED: keyFromString("CREATE_DEPOSIT_FEATURE_DISABLED"),
  EXECUTE_DEPOSIT_FEATURE_DISABLED: keyFromString("EXECUTE_DEPOSIT_FEATURE_DISABLED"),
  CREATE_WITHDRAWAL_FEATURE_DISABLED: keyFromString("CREATE_WITHDRAWAL_FEATURE_DISABLED"),
  EXECUTE_WITHDRAWAL_FEATURE_DISABLED: keyFromString("EXECUTE_WITHDRAWAL_FEATURE_DISABLED"),
  SUBACCOUNT_FEATURE_DISABLED: keyFromString("SUBACCOUNT_FEATURE_DISABLED"),
  GASLESS_FEATURE_DISABLED: keyFromString("GASLESS_FEATURE_DISABLED"),
  CREATE_DEPOSIT_GAS_LIMIT: keyFromString("CREATE_DEPOSIT_GAS_LIMIT"),
  DEPOSIT_GAS_LIMIT: keyFromString("DEPOSIT_GAS_LIMIT"),
  CREATE_WITHDRAWAL_GAS_LIMIT: keyFromString("CREATE_WITHDRAWAL_GAS_LIMIT"),
  WITHDRAWAL_GAS_LIMIT: keyFromString("WITHDRAWAL_GAS_LIMIT"),
  SINGLE_SWAP_GAS_LIMIT: keyFromString("SINGLE_SWAP_GAS_LIMIT"),
  INCREASE_ORDER_GAS_LIMIT: keyFromString("INCREASE_ORDER_GAS_LIMIT"),
  DECREASE_ORDER_GAS_LIMIT: keyFromString("DECREASE_ORDER_GAS_LIMIT"),
  SWAP_ORDER_GAS_LIMIT: keyFromString("SWAP_ORDER_GAS_LIMIT"),
  TOKEN_TRANSFER_GAS_LIMIT: keyFromString("TOKEN_TRANSFER_GAS_LIMIT"),
  NATIVE_TOKEN_TRANSFER_GAS_LIMIT: keyFromString("NATIVE_TOKEN_TRANSFER_GAS_LIMIT"),
  MULTICHAIN_READ_CHANNEL: keyFromString("MULTICHAIN_READ_CHANNEL"),
  MULTICHAIN_PEERS: keyFromString("MULTICHAIN_PEERS"),
  MULTICHAIN_CONFIRMATIONS: keyFromString("MULTICHAIN_CONFIRMATIONS"),
  MULTICHAIN_AUTHORIZED_ORIGINATORS: keyFromString("MULTICHAIN_AUTHORIZED_ORIGINATORS"),
  FEE_DISTRIBUTOR_DISTRIBUTION_DAY: keyFromString("FEE_DISTRIBUTOR_DISTRIBUTION_DAY"),
  FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP: keyFromString("FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP"),
  FEE_DISTRIBUTOR_STATE: keyFromString("FEE_DISTRIBUTOR_STATE"),
  FEE_DISTRIBUTOR_REFERRAL_REWARDS_AMOUNT: keyFromString("FEE_DISTRIBUTOR_REFERRAL_REWARDS_AMOUNT"),
  FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT: keyFromString("FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT"),
  FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR: keyFromString("FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR"),
  FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT: keyFromString("FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT"),
  FEE_DISTRIBUTOR_GMX_PRICE: keyFromString("FEE_DISTRIBUTOR_GMX_PRICE"),
  FEE_DISTRIBUTOR_WNT_PRICE: keyFromString("FEE_DISTRIBUTOR_WNT_PRICE"),
  FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY: keyFromString("FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY"),
  FEE_DISTRIBUTOR_GAS_LIMIT: keyFromString("FEE_DISTRIBUTOR_GAS_LIMIT"),
  FEE_DISTRIBUTOR_CHAIN_ID: keyFromString("FEE_DISTRIBUTOR_CHAIN_ID"),
  FEE_DISTRIBUTOR_FEE_AMOUNT_GMX: keyFromString("FEE_DISTRIBUTOR_FEE_AMOUNT_GMX"),
  FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX: keyFromString("FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX"),
  FEE_DISTRIBUTOR_FEE_AMOUNT_USD: keyFromString("FEE_DISTRIBUTOR_FEE_AMOUNT_USD"),
  FEE_DISTRIBUTOR_STAKED_GMX: keyFromString("FEE_DISTRIBUTOR_STAKED_GMX"),
  FEE_DISTRIBUTOR_TOTAL_STAKED_GMX: keyFromString("FEE_DISTRIBUTOR_TOTAL_STAKED_GMX"),
  FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR: keyFromString("FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR"),
  FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP: keyFromString("FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP"),
  FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID: keyFromString("FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID"),
  FEE_DISTRIBUTOR_CHAINLINK_FACTOR: keyFromString("FEE_DISTRIBUTOR_CHAINLINK_FACTOR"),
  FEE_DISTRIBUTOR_REFERRAL_REWARDS_DEPOSITED: keyFromString("FEE_DISTRIBUTOR_REFERRAL_REWARDS_DEPOSITED"),
  FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY: keyFromString("FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY"),
  FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR: keyFromString("FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR"),
  FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR: keyFromString("FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR"),
  FEE_DISTRIBUTOR_KEEPER_COSTS: keyFromString("FEE_DISTRIBUTOR_KEEPER_COSTS"),
};

const MARKET_PROP_KEYS = {
  VAULT: keyFromString("VAULT"),
  INDEX_TOKEN: keyFromString("INDEX_TOKEN"),
  COLLATERAL_TOKEN: keyFromString("COLLATERAL_TOKEN"),
};

const POSITION_FIELD_KEYS = {
  MARKET_INDEX: keyFromString("MARKET_INDEX"),
  COLLATERAL_AMOUNT: keyFromString("COLLATERAL_AMOUNT"),
  IS_LONG: keyFromString("IS_LONG"),
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
  poolUsdWithoutPnl: number;
  positionCollateralUsd: number;
  longPnlToPoolFactor: number;
  shortPnlToPoolFactor: number;
  longPositionCollateralUsd: number;
  shortPositionCollateralUsd: number;
  longCumulativeOpenCostsUsd: number;
  shortCumulativeOpenCostsUsd: number;
  positionFeeFactorPct: number;
  constantPriceSpreadPct: number;
  positionImpactFactorPositive: number;
  positionImpactFactorNegative: number;
  positionImpactExponentPositive: number;
  positionImpactExponentNegative: number;
  maxPositionImpactFactorPositivePct: number;
  maxPositionImpactFactorNegativePct: number;
  priceImpactParameter: number;
  bidDepthUsd: number;
  askDepthUsd: number;
  maxOpenInterestFactorLongPct: number;
  maxOpenInterestFactorShortPct: number;
  reserveFactorLongPct: number;
  reserveFactorShortPct: number;
  openInterestReserveFactorLongPct: number;
  openInterestReserveFactorShortPct: number;
  longReservedUsd: number;
  shortReservedUsd: number;
  availableLongUsd: number;
  availableShortUsd: number;
  minCollateralFactorPct: number;
  minCollateralFactorForOpenInterestMultiplierLongPct: number;
  minCollateralFactorForOpenInterestMultiplierShortPct: number;
  minCollateralUsd: number;
  minCollateralFactorForLiquidationPct: number;
  minPositionSizeUsd: number;
  maxPositionSizeUsd: number;
  liquidationGraceBaseMinutes: number;
  liquidationFeeFactorPct: number;
  fundingSkewEmaMinutes: number;
  fundingSkewEmaPct: number;
  fundingSkewSampleIntervalMinutes: number;
  fundingFloorAprPct: number;
  fundingBaseAprPct: number;
  minFundingAprPct: number;
  maxFundingAprPct: number;
  fundingUpdatedAt?: number;
  fundingUpdatedAgoMinutes?: number;
  longFundingAprPct?: number;
  shortFundingAprPct?: number;
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
  maxOracleRefPriceDeviationFactorPct?: number;
  maxPriceImpactSpreadPct?: number;
  skewImpactFactor?: number;
  minSkewImpact?: number;
  maxSkewImpact?: number;
  protocolOpsCurrent?: ParameterValueSet;
  distributionOpsCurrent?: ParameterValueSet;
  distributionRegistry?: DistributionRegistrySection[];
  readStatus: EnvironmentInfo["readStatus"];
  onchainMarkets: OnchainMarketState[];
  externalVenueMarkets: Record<string, ExternalVenueMarketState>;
}

const assetSeeds: Record<string, AssetSeed> = {
  ETH: { referencePriceUsd: 4425 },
  BTC: { referencePriceUsd: 84210 },
};


const rawParameterDefinitions: ParameterFieldDefinition[] = [
  { category: "Fees", label: "Open Fee Ratio", key: "openFeeRatio", unit: "%" },
  { category: "Fees", label: "Close Fee Ratio", key: "closeFeeRatio", unit: "%" },
  { category: "Fees", label: "Constant Spread", key: "constantSpread", unit: "%" },
  { category: "Fees", label: "Liquidation Fee Factor", key: "liquidationFeeFactor", unit: "%" },
  { category: "Price", label: "Max Price Deviation", key: "maxPriceDeviation", unit: "%" },
  { category: "Price", label: "Price Impact Normal", key: "priceImpactNormal", unit: "x" },
  { category: "Price", label: "Price Impact Emergency", key: "priceImpactEmergency", unit: "x" },
  { category: "Price", label: "Max Price Impact Spread", key: "maxPriceImpactSpread", unit: "%" },
  { category: "Price", label: "Position Impact +", key: "positionImpactFactorPositive", unit: "x" },
  { category: "Price", label: "Position Impact -", key: "positionImpactFactorNegative", unit: "x" },
  { category: "Price", label: "Impact Exponent +", key: "positionImpactExponentPositive", unit: "x" },
  { category: "Price", label: "Impact Exponent -", key: "positionImpactExponentNegative", unit: "x" },
  { category: "Price", label: "Max Position Impact +", key: "maxPositionImpactFactorPositive", unit: "%" },
  { category: "Price", label: "Max Position Impact -", key: "maxPositionImpactFactorNegative", unit: "%" },
  { category: "Price", label: "PI Clamp Min", key: "piClampMin", unit: "%" },
  { category: "Price", label: "PI Clamp Max", key: "piClampMax", unit: "%" },
  { category: "Position Limits", label: "Max Leverage", key: "maxLev", unit: "x" },
  { category: "Position Limits", label: "Min Position USD", key: "minPosUsd", unit: "$" },
  { category: "Position Limits", label: "Min Collateral USD", key: "minCollateralUsd", unit: "$" },
  { category: "Position Limits", label: "Single Position Cap", key: "singlePosCap", unit: "%" },
  { category: "Position Limits", label: "Global Cap", key: "globalCap", unit: "%" },
  { category: "Position Limits", label: "Single Position Cap USD", key: "singlePosCapUsd", unit: "$" },
  { category: "Position Limits", label: "Global Cap USD", key: "globalCapUsd", unit: "$" },
  { category: "Position Limits", label: "Max OI Factor Long", key: "maxOpenInterestFactorLong", unit: "%" },
  { category: "Position Limits", label: "Max OI Factor Short", key: "maxOpenInterestFactorShort", unit: "%" },
  { category: "Cooldown", label: "Open Cooldown", key: "openCooldownSec", unit: "s" },
  { category: "Risk", label: "Reserve Factor", key: "reserveFactor", unit: "%" },
  { category: "Risk", label: "Reserve Factor Long", key: "reserveFactorLong", unit: "%" },
  { category: "Risk", label: "Reserve Factor Short", key: "reserveFactorShort", unit: "%" },
  { category: "Risk", label: "OI Reserve Factor Long", key: "oiReserveFactorLong", unit: "%" },
  { category: "Risk", label: "OI Reserve Factor Short", key: "oiReserveFactorShort", unit: "%" },
  { category: "Risk", label: "Min Collateral Factor", key: "minCollateralFactor", unit: "%" },
  { category: "Risk", label: "Min CF for OI Multiplier Long", key: "minCollateralFactorForOIMultiplierLong", unit: "%" },
  { category: "Risk", label: "Min CF for OI Multiplier Short", key: "minCollateralFactorForOIMultiplierShort", unit: "%" },
  { category: "Risk", label: "Risk Threshold", key: "riskThreshold", unit: "%" },
  { category: "Risk", label: "Target Risk Ratio", key: "targetRiskRatio", unit: "%" },
  { category: "Funding", label: "Funding Floor APR", key: "fundingFloorApr", unit: "%" },
  { category: "Funding", label: "Funding Base APR", key: "fundingBaseApr", unit: "%" },
  { category: "Funding", label: "Funding Emergency APR", key: "fundingEmergencyApr", unit: "%" },
  { category: "Funding", label: "Min Funding Rate", key: "minFundingRate", unit: "%" },
  { category: "Funding", label: "Max Funding Rate", key: "maxFundingRate", unit: "%" },
  { category: "Skew", label: "Skew EMA", key: "skewEmaMinutes", unit: "min" },
  { category: "Skew", label: "Skew Impact Factor", key: "skewImpactFactor", unit: "x" },
  { category: "Skew", label: "Skew K Normal", key: "skewKNormal", unit: "x" },
  { category: "Skew", label: "Skew K Emergency", key: "skewKEmergency", unit: "x" },
  { category: "Skew", label: "Skew Clamp Live Min", key: "skewClampLiveMin", unit: "x" },
  { category: "Skew", label: "Skew Clamp Live Max", key: "skewClampLiveMax", unit: "x" },
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

const rawProtocolOpsDefinitions: ProtocolOpsFieldDefinition[] = [
  { category: "Oracle", label: "Min Oracle Signers", key: "minOracleSigners", unit: "" },
  { category: "Oracle", label: "Min Block Confirmations", key: "minOracleBlockConfirmations", unit: "" },
  { category: "Oracle", label: "Max Oracle Price Age", key: "maxOraclePriceAgeSec", unit: "s" },
  { category: "Oracle", label: "Max Atomic Oracle Price Age", key: "maxAtomicOraclePriceAgeSec", unit: "s" },
  { category: "Oracle", label: "Max Oracle Timestamp Range", key: "maxOracleTimestampRangeSec", unit: "s" },
  { category: "Oracle", label: "Sequencer Grace Duration", key: "sequencerGraceDurationSec", unit: "s" },
  { category: "Oracle", label: "Max Ref Price Deviation", key: "maxOracleRefPriceDeviationPct", unit: "%" },
  { category: "Execution", label: "Create Deposit Gas", key: "createDepositGasLimit", unit: "gas" },
  { category: "Execution", label: "Deposit Gas", key: "depositGasLimit", unit: "gas" },
  { category: "Execution", label: "Create Withdrawal Gas", key: "createWithdrawalGasLimit", unit: "gas" },
  { category: "Execution", label: "Withdrawal Gas", key: "withdrawalGasLimit", unit: "gas" },
  { category: "Execution", label: "Single Swap Gas", key: "singleSwapGasLimit", unit: "gas" },
  { category: "Execution", label: "Increase Order Gas", key: "increaseOrderGasLimit", unit: "gas" },
  { category: "Execution", label: "Decrease Order Gas", key: "decreaseOrderGasLimit", unit: "gas" },
  { category: "Execution", label: "Swap Order Gas", key: "swapOrderGasLimit", unit: "gas" },
  { category: "Execution", label: "Token Transfer Gas", key: "tokenTransferGasLimit", unit: "gas" },
  { category: "Execution", label: "Native Transfer Gas", key: "nativeTokenTransferGasLimit", unit: "gas" },
  { category: "Feature Flags", label: "Create Order Disabled", key: "createOrderDisabled", unit: "" },
  { category: "Feature Flags", label: "Execute Order Disabled", key: "executeOrderDisabled", unit: "" },
  { category: "Feature Flags", label: "Update Order Disabled", key: "updateOrderDisabled", unit: "" },
  { category: "Feature Flags", label: "Cancel Order Disabled", key: "cancelOrderDisabled", unit: "" },
  { category: "Feature Flags", label: "Create Deposit Disabled", key: "createDepositDisabled", unit: "" },
  { category: "Feature Flags", label: "Execute Deposit Disabled", key: "executeDepositDisabled", unit: "" },
  { category: "Feature Flags", label: "Create Withdrawal Disabled", key: "createWithdrawalDisabled", unit: "" },
  { category: "Feature Flags", label: "Execute Withdrawal Disabled", key: "executeWithdrawalDisabled", unit: "" },
  { category: "Feature Flags", label: "Subaccount Disabled", key: "subaccountDisabled", unit: "" },
  { category: "Feature Flags", label: "Gasless Disabled", key: "gaslessDisabled", unit: "" },
];

const distributionOpsDefinitions: DistributionOpsFieldDefinition[] = [
  { category: "Multichain", label: "Read Channel", key: "multichainReadChannel", unit: "", businessMeaning: "Current multichain read channel identifier.", riskControlled: "Cross-chain read routing correctness.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Multichain", label: "Peer For Read Channel", key: "multichainPeerForReadChannel", unit: "", businessMeaning: "Configured peer for the active read channel.", riskControlled: "Cross-chain counterpart integrity.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Multichain", label: "Confirmations For Read Channel", key: "multichainConfirmationsForReadChannel", unit: "", businessMeaning: "Required confirmations for the active read channel.", riskControlled: "Reorg / premature cross-chain acceptance.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Distribution Day", key: "feeDistributorDistributionDay", unit: "", businessMeaning: "Current fee-distribution day index.", riskControlled: "Distribution scheduling coherence.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Distribution Timestamp", key: "feeDistributorDistributionTimestamp", unit: "s", businessMeaning: "Distribution timestamp anchor.", riskControlled: "Distribution cadence drift.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "State", key: "feeDistributorState", unit: "", businessMeaning: "FeeDistributor state machine value.", riskControlled: "Distribution stuck-state detection.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Max Read Response Delay", key: "feeDistributorMaxReadResponseDelaySec", unit: "s", businessMeaning: "Maximum tolerated delay for read responses.", riskControlled: "Stale multichain distribution data.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Gas Limit", key: "feeDistributorGasLimit", unit: "gas", businessMeaning: "Execution gas budget for distributor actions.", riskControlled: "Underfunded distributor execution.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Fee Distributor Chain ID", key: "feeDistributorChainId", unit: "", businessMeaning: "Primary chain id used by the fee distributor context.", riskControlled: "Distribution routing to wrong chain.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Read Response Timestamp", key: "feeDistributorReadResponseTimestamp", unit: "s", businessMeaning: "Timestamp of last read-response update.", riskControlled: "Silent data staleness.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Max WNT Referral Rewards USD", key: "feeDistributorMaxReferralRewardsWntUsdAmount", unit: "$", businessMeaning: "Absolute cap on WNT referral rewards in USD terms.", riskControlled: "Over-distribution of referral rewards.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Max WNT Referral Rewards Factor", key: "feeDistributorMaxReferralRewardsWntUsdFactorPct", unit: "%", businessMeaning: "Factor cap for WNT referral rewards.", riskControlled: "Referral payout inflation.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Max ESGMX Referral Rewards", key: "feeDistributorMaxReferralRewardsEsgmxAmount", unit: "token", businessMeaning: "Absolute cap on ESGMX referral rewards.", riskControlled: "Referral payout inflation.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "GMX Price", key: "feeDistributorGmxPriceUsd", unit: "$", businessMeaning: "GMX price snapshot used by the distributor.", riskControlled: "Distribution math using stale/wrong token price.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "WNT Price", key: "feeDistributorWntPriceUsd", unit: "$", businessMeaning: "WNT price snapshot used by the distributor.", riskControlled: "Distribution math using stale/wrong token price.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Chainlink Factor", key: "feeDistributorChainlinkFactorPct", unit: "%", businessMeaning: "Chainlink adjustment factor in distributor pricing.", riskControlled: "Mispriced distributor conversions.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "Max WNT From Treasury", key: "feeDistributorMaxWntAmountFromTreasury", unit: "token", businessMeaning: "Treasury draw cap in WNT terms.", riskControlled: "Treasury drain by distribution process.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "V1 Fees in WNT Factor", key: "feeDistributorV1FeesWntFactorPct", unit: "%", businessMeaning: "Share of V1 fees represented in WNT terms.", riskControlled: "Fee conversion / distribution skew.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Fee Distributor", label: "V2 Fees in WNT Factor", key: "feeDistributorV2FeesWntFactorPct", unit: "%", businessMeaning: "Share of V2 fees represented in WNT terms.", riskControlled: "Fee conversion / distribution skew.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Fee Amount GMX", key: "feeDistributorFeeAmountGmxForCurrentChain", unit: "token", businessMeaning: "Current-chain GMX fee bucket.", riskControlled: "Current-chain distribution accounting mismatch.", runtimeStatus: "Active Keys2 chain-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Total Fee Amount GMX", key: "feeDistributorTotalFeeAmountGmx", unit: "token", businessMeaning: "Total GMX fee inventory tracked by distributor.", riskControlled: "Fee-accounting mismatch.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Fee Amount USD V1", key: "feeDistributorFeeAmountUsdV1", unit: "$", businessMeaning: "Current-chain V1 fee amount in USD.", riskControlled: "Cross-version fee-accounting mismatch.", runtimeStatus: "Active Keys2 chain-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Fee Amount USD V2", key: "feeDistributorFeeAmountUsdV2", unit: "$", businessMeaning: "Current-chain V2 fee amount in USD.", riskControlled: "Cross-version fee-accounting mismatch.", runtimeStatus: "Active Keys2 chain-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Staked GMX", key: "feeDistributorStakedGmxForCurrentChain", unit: "token", businessMeaning: "Current-chain staked GMX amount.", riskControlled: "Reward-share accounting mismatch.", runtimeStatus: "Active Keys2 chain-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Total Staked GMX", key: "feeDistributorTotalStakedGmx", unit: "token", businessMeaning: "Global staked GMX amount tracked by distributor.", riskControlled: "Reward-share accounting mismatch.", runtimeStatus: "Active Keys2 scalar.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "Bridge Slippage Factor", key: "feeDistributorBridgeSlippageFactorPct", unit: "%", businessMeaning: "Bridge slippage budget applied on this chain.", riskControlled: "Bridge loss / under-provisioning during transfers.", runtimeStatus: "Active Keys2 chain-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Current Chain", label: "LayerZero Chain ID", key: "feeDistributorLayerZeroChainId", unit: "", businessMeaning: "LayerZero chain id bound to current chain.", riskControlled: "Cross-chain routing mismatch.", runtimeStatus: "Active Keys2 chain-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Referral Snapshot", label: "Referral Rewards Amount (CORE_USDC)", key: "feeDistributorReferralRewardsAmountCoreUsdc", unit: "$", businessMeaning: "Tracked referral rewards amount for CORE_USDC.", riskControlled: "Referral accounting mismatch.", runtimeStatus: "Active Keys2 address-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
  { category: "Referral Snapshot", label: "Referral Rewards Deposited (CORE_USDC)", key: "feeDistributorReferralRewardsDepositedCoreUsdc", unit: "$", businessMeaning: "Already deposited referral rewards for CORE_USDC.", riskControlled: "Double-counting or under-counting referral deposits.", runtimeStatus: "Active Keys2 address-scoped value.", testStatus: "Operator-visible; no dedicated monitor-side test." },
];

const parameterDefinitions: ParameterFieldDefinition[] = rawParameterDefinitions.map(decorateParameterDefinition);
const protocolOpsDefinitions: ProtocolOpsFieldDefinition[] = rawProtocolOpsDefinitions.map(decorateProtocolOpsDefinition);

const tierTemplates: Record<string, ParameterValueSet> = {
  "Tier 1": {
    openFeeRatio: 0.02,
    closeFeeRatio: 0.02,
    constantSpread: 0.01,
    liquidationFeeFactor: 0.05,
    maxPriceDeviation: 1.5,
    priceImpactNormal: 0.8,
    priceImpactEmergency: 1.1,
    maxPriceImpactSpread: 0.5,
    positionImpactFactorPositive: 0.0002,
    positionImpactFactorNegative: 0.0002,
    positionImpactExponentPositive: 2,
    positionImpactExponentNegative: 2,
    maxPositionImpactFactorPositive: 0.5,
    maxPositionImpactFactorNegative: 0.5,
    piClampMin: 0,
    piClampMax: 0.5,
    maxLev: 100,
    minPosUsd: 10,
    minCollateralUsd: 10,
    singlePosCap: 22,
    globalCap: 100,
    singlePosCapUsd: 8_000_000,
    globalCapUsd: 40_000_000,
    maxOpenInterestFactorLong: 1000,
    maxOpenInterestFactorShort: 1000,
    openCooldownSec: 20,
    reserveFactor: 25,
    reserveFactorLong: 25,
    reserveFactorShort: 25,
    oiReserveFactorLong: 25,
    oiReserveFactorShort: 25,
    minCollateralFactor: 0.5,
    minCollateralFactorForOIMultiplierLong: 0.5,
    minCollateralFactorForOIMultiplierShort: 0.5,
    riskThreshold: 10,
    targetRiskRatio: 5,
    fundingFloorApr: 10.95,
    fundingBaseApr: 28,
    fundingEmergencyApr: 84,
    minFundingRate: -12,
    maxFundingRate: 140,
    skewEmaMinutes: 20,
    skewImpactFactor: 0.0025,
    skewKNormal: 0.25,
    skewKEmergency: 0.9,
    skewClampLiveMin: 0,
    skewClampLiveMax: 0.005,
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
    liquidationFeeFactor: 0.05,
    maxPriceDeviation: 2,
    priceImpactNormal: 1,
    priceImpactEmergency: 1.4,
    maxPriceImpactSpread: 0.5,
    positionImpactFactorPositive: 0.0002,
    positionImpactFactorNegative: 0.0002,
    positionImpactExponentPositive: 2,
    positionImpactExponentNegative: 2,
    maxPositionImpactFactorPositive: 0.5,
    maxPositionImpactFactorNegative: 0.5,
    piClampMin: 0,
    piClampMax: 0.75,
    maxLev: 75,
    minPosUsd: 15,
    minCollateralUsd: 15,
    singlePosCap: 18,
    globalCap: 85,
    singlePosCapUsd: 5_000_000,
    globalCapUsd: 24_000_000,
    maxOpenInterestFactorLong: 1000,
    maxOpenInterestFactorShort: 1000,
    openCooldownSec: 30,
    reserveFactor: 30,
    reserveFactorLong: 30,
    reserveFactorShort: 30,
    oiReserveFactorLong: 30,
    oiReserveFactorShort: 30,
    minCollateralFactor: 0.8,
    minCollateralFactorForOIMultiplierLong: 0.8,
    minCollateralFactorForOIMultiplierShort: 0.8,
    riskThreshold: 12,
    targetRiskRatio: 6,
    fundingFloorApr: 12.5,
    fundingBaseApr: 36,
    fundingEmergencyApr: 96,
    minFundingRate: -16,
    maxFundingRate: 180,
    skewEmaMinutes: 30,
    skewImpactFactor: 0.0025,
    skewKNormal: 0.35,
    skewKEmergency: 1.2,
    skewClampLiveMin: 0,
    skewClampLiveMax: 0.005,
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
    liquidationFeeFactor: 0.05,
    maxPriceDeviation: 2.5,
    priceImpactNormal: 1.2,
    priceImpactEmergency: 1.8,
    maxPriceImpactSpread: 0.5,
    positionImpactFactorPositive: 0.0002,
    positionImpactFactorNegative: 0.0002,
    positionImpactExponentPositive: 2,
    positionImpactExponentNegative: 2,
    maxPositionImpactFactorPositive: 0.5,
    maxPositionImpactFactorNegative: 0.5,
    piClampMin: 0,
    piClampMax: 1.25,
    maxLev: 50,
    minPosUsd: 20,
    minCollateralUsd: 20,
    singlePosCap: 12,
    globalCap: 60,
    singlePosCapUsd: 2_500_000,
    globalCapUsd: 12_000_000,
    maxOpenInterestFactorLong: 1000,
    maxOpenInterestFactorShort: 1000,
    openCooldownSec: 45,
    reserveFactor: 35,
    reserveFactorLong: 35,
    reserveFactorShort: 35,
    oiReserveFactorLong: 35,
    oiReserveFactorShort: 35,
    minCollateralFactor: 1,
    minCollateralFactorForOIMultiplierLong: 1,
    minCollateralFactorForOIMultiplierShort: 1,
    riskThreshold: 15,
    targetRiskRatio: 8,
    fundingFloorApr: 16,
    fundingBaseApr: 48,
    fundingEmergencyApr: 140,
    minFundingRate: -18,
    maxFundingRate: 240,
    skewEmaMinutes: 40,
    skewImpactFactor: 0.0025,
    skewKNormal: 0.5,
    skewKEmergency: 1.6,
    skewClampLiveMin: 0,
    skewClampLiveMax: 0.005,
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

function compositeBytes32Key(baseKey: string, subKey: string): string {
  return hashKey(["bytes32", "bytes32"], [baseKey, subKey]);
}

function scopedUintKey(baseKey: string, value: bigint | number): string {
  return hashKey(["bytes32", "uint256"], [baseKey, BigInt(value)]);
}

function scopedAddressKey(baseKey: string, value: string): string {
  return hashKey(["bytes32", "address"], [baseKey, getAddress(value)]);
}

function scopedStringKey(baseKey: string, value: string): string {
  return hashKey(["bytes32", "bytes32"], [baseKey, keyFromString(value)]);
}

function scopedChainStringKey(baseKey: string, chainId: bigint | number, value: string): string {
  return hashKey(["bytes32", "uint256", "bytes32"], [baseKey, BigInt(chainId), keyFromString(value)]);
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


function tokenAmountToDisplay(value: number): number {
  return value / TOKEN_PRECISION;
}

function tokenAmountToUsd(value: number, priceUsd: number): number {
  return tokenAmountToDisplay(value) * priceUsd;
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

function factorToRatioSigned(raw: bigint): number {
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

async function readBool(provider: JsonRpcProvider, key: string): Promise<boolean> {
  return dataStoreCall<boolean>(provider, "getBool", [key]);
}

async function readAddressArray(provider: JsonRpcProvider, key: string): Promise<string[]> {
  return dataStoreCall<string[]>(provider, "getAddressArray", [key]);
}

async function readUintArray(provider: JsonRpcProvider, key: string): Promise<bigint[]> {
  return dataStoreCall<bigint[]>(provider, "getUintArray", [key]);
}

async function readBoolArray(provider: JsonRpcProvider, key: string): Promise<boolean[]> {
  return dataStoreCall<boolean[]>(provider, "getBoolArray", [key]);
}

async function readBytes32ValuesAt(provider: JsonRpcProvider, key: string, start: number, end: number): Promise<string[]> {
  return dataStoreCall<string[]>(provider, "getBytes32ValuesAt", [key, BigInt(start), BigInt(end)]);
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
    const [
      maxOracleRefPriceDeviationFactorRaw,
      minOracleSignersRaw,
      minOracleBlockConfirmationsRaw,
      maxOraclePriceAgeRaw,
      maxAtomicOraclePriceAgeRaw,
      maxOracleTimestampRangeRaw,
      sequencerGraceDurationRaw,
      maxPriceImpactSpreadRaw,
      skewImpactFactorRaw,
      minSkewImpactRaw,
      maxSkewImpactRaw,
      createOrderDisabled,
      executeOrderDisabled,
      updateOrderDisabled,
      cancelOrderDisabled,
      createDepositDisabled,
      executeDepositDisabled,
      createWithdrawalDisabled,
      executeWithdrawalDisabled,
      subaccountDisabled,
      gaslessDisabled,
      createDepositGasLimitRaw,
      depositGasLimitRaw,
      createWithdrawalGasLimitRaw,
      withdrawalGasLimitRaw,
      singleSwapGasLimitRaw,
      increaseOrderGasLimitRaw,
      decreaseOrderGasLimitRaw,
      swapOrderGasLimitRaw,
      tokenTransferGasLimitRaw,
      nativeTokenTransferGasLimitRaw,
    ] = await Promise.all([
      readUint(provider, DATA_KEYS.MAX_ORACLE_REF_PRICE_DEVIATION_FACTOR),
      readUint(provider, DATA_KEYS.MIN_ORACLE_SIGNERS),
      readUint(provider, DATA_KEYS.MIN_ORACLE_BLOCK_CONFIRMATIONS),
      readUint(provider, DATA_KEYS.MAX_ORACLE_PRICE_AGE),
      readUint(provider, DATA_KEYS.MAX_ATOMIC_ORACLE_PRICE_AGE),
      readUint(provider, DATA_KEYS.MAX_ORACLE_TIMESTAMP_RANGE),
      readUint(provider, DATA_KEYS.SEQUENCER_GRACE_DURATION),
      readUint(provider, DATA_KEYS.MAX_PRICE_IMPACT_SPREAD),
      readInt(provider, DATA_KEYS.SKEW_IMPACT_FACTOR),
      readInt(provider, DATA_KEYS.MIN_SKEW_IMPACT),
      readInt(provider, DATA_KEYS.MAX_SKEW_IMPACT),
      readBool(provider, DATA_KEYS.CREATE_ORDER_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.EXECUTE_ORDER_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.UPDATE_ORDER_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.CANCEL_ORDER_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.CREATE_DEPOSIT_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.EXECUTE_DEPOSIT_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.CREATE_WITHDRAWAL_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.EXECUTE_WITHDRAWAL_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.SUBACCOUNT_FEATURE_DISABLED),
      readBool(provider, DATA_KEYS.GASLESS_FEATURE_DISABLED),
      readUint(provider, DATA_KEYS.CREATE_DEPOSIT_GAS_LIMIT),
      readUint(provider, DATA_KEYS.DEPOSIT_GAS_LIMIT),
      readUint(provider, DATA_KEYS.CREATE_WITHDRAWAL_GAS_LIMIT),
      readUint(provider, DATA_KEYS.WITHDRAWAL_GAS_LIMIT),
      readUint(provider, DATA_KEYS.SINGLE_SWAP_GAS_LIMIT),
      readUint(provider, DATA_KEYS.INCREASE_ORDER_GAS_LIMIT),
      readUint(provider, DATA_KEYS.DECREASE_ORDER_GAS_LIMIT),
      readUint(provider, DATA_KEYS.SWAP_ORDER_GAS_LIMIT),
      readUint(provider, DATA_KEYS.TOKEN_TRANSFER_GAS_LIMIT),
      readUint(provider, DATA_KEYS.NATIVE_TOKEN_TRANSFER_GAS_LIMIT),
    ]);
    const count = Number(await dataStoreCall<bigint>(provider, "getUintCount", [DATA_KEYS.MARKET_LIST]));
    const marketIndicesFromList = count > 0 ? ((await dataStoreCall<bigint[]>(provider, "getUintValuesAt", [DATA_KEYS.MARKET_LIST, BigInt(0), BigInt(count)])).map((value) => Number(value))) : [];
    const configuredMarketIndices = basefx100Sepolia0312.markets.map((market) => market.marketIndex);
    const marketIndices = Array.from(new Set([...marketIndicesFromList, ...configuredMarketIndices])).sort((a, b) => a - b);

    const onchainMarketsRaw: Array<OnchainMarketState | null> = await Promise.all(
      marketIndices.map(async (marketIndex): Promise<OnchainMarketState | null> => {
        const [vault, indexToken, collateralToken] = await Promise.all([
          readAddress(provider, marketPropKey(marketIndex, MARKET_PROP_KEYS.VAULT)),
          readAddress(provider, marketPropKey(marketIndex, MARKET_PROP_KEYS.INDEX_TOKEN)),
          readAddress(provider, marketPropKey(marketIndex, MARKET_PROP_KEYS.COLLATERAL_TOKEN)),
        ]);

        if (vault === ZeroAddress || indexToken === ZeroAddress || collateralToken === ZeroAddress) {
          return null;
        }

        const configuredMarket = basefx100Sepolia0312.markets.find((market) => market.marketIndex === marketIndex);
        const symbol = configuredMarket?.symbol ?? symbolFromMarket(indexToken, marketIndex);
        const displayName = displayFromSymbol(symbol);
        const collateralTokenDecimals = inferTokenDecimals(symbol, collateralToken);
        const indexTokenDecimals = inferTokenDecimals(symbol, indexToken);

        const [
          collateralVaultBalance,
          indexVaultBalance,
          positionFeeFactorRaw,
          constantPriceSpreadRaw,
          positionImpactFactorPositiveRaw,
          positionImpactFactorNegativeRaw,
          positionImpactExponentPositiveRaw,
          positionImpactExponentNegativeRaw,
          maxPositionImpactFactorPositiveRaw,
          maxPositionImpactFactorNegativeRaw,
          priceImpactParameterRaw,
          poolCollateralAmountRaw,
          maxOpenInterestLongRaw,
          maxOpenInterestShortRaw,
          longCumulativeOpenCostsRaw,
          shortCumulativeOpenCostsRaw,
          maxOpenInterestFactorLongRaw,
          maxOpenInterestFactorShortRaw,
          bidDepthRaw,
          askDepthRaw,
          reserveFactorLongRaw,
          reserveFactorShortRaw,
          openInterestReserveFactorLongRaw,
          openInterestReserveFactorShortRaw,
          minCollateralFactorRaw,
          minCollateralFactorForOpenInterestMultiplierLongRaw,
          minCollateralFactorForOpenInterestMultiplierShortRaw,
          minCollateralUsdRaw,
          minCollateralFactorForLiquidationRaw,
          minPositionSizeUsdRaw,
          maxPositionSizeUsdRaw,
          liquidationGracePeriodBaseRaw,
          liquidationFeeFactorRaw,
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
          readUint(provider, marketUintKey(DATA_KEYS.CONSTANT_PRICE_SPREAD, marketIndex)),
          readUint(provider, marketBoolKey(DATA_KEYS.POSITION_IMPACT_FACTOR, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.POSITION_IMPACT_FACTOR, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.POSITION_IMPACT_EXPONENT_FACTOR, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.POSITION_IMPACT_EXPONENT_FACTOR, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_POSITION_IMPACT_FACTOR, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_POSITION_IMPACT_FACTOR, marketIndex, false)),
          readUint(provider, marketUintKey(DATA_KEYS.PRICE_IMPACT_PARAMETER, marketIndex)),
          readUint(provider, marketAddressKey(DATA_KEYS.POOL_AMOUNT, marketIndex, collateralToken)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_OPEN_INTEREST, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_OPEN_INTEREST, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.CUMULATIVE_OPEN_COSTS, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.CUMULATIVE_OPEN_COSTS, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_OPEN_INTEREST_FACTOR, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.MAX_OPEN_INTEREST_FACTOR, marketIndex, false)),
          readUint(provider, marketUintKey(DATA_KEYS.BID_ORDER_BOOK_DEPTH, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.ASK_ORDER_BOOK_DEPTH, marketIndex)),
          readUint(provider, marketBoolKey(DATA_KEYS.RESERVE_FACTOR, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.RESERVE_FACTOR, marketIndex, false)),
          readUint(provider, marketBoolKey(DATA_KEYS.OPEN_INTEREST_RESERVE_FACTOR, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.OPEN_INTEREST_RESERVE_FACTOR, marketIndex, false)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_COLLATERAL_FACTOR, marketIndex)),
          readUint(provider, marketBoolKey(DATA_KEYS.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER, marketIndex, true)),
          readUint(provider, marketBoolKey(DATA_KEYS.MIN_COLLATERAL_FACTOR_FOR_OPEN_INTEREST_MULTIPLIER, marketIndex, false)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_COLLATERAL_USD, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_COLLATERAL_FACTOR_FOR_LIQUIDATION, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MIN_POSITION_SIZE_USD, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.MAX_POSITION_SIZE_USD, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.LIQUIDATION_GRACE_PERIOD_BASE, marketIndex)),
          readUint(provider, marketUintKey(DATA_KEYS.LIQUIDATION_FEE_FACTOR, marketIndex)),
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
        let longFundingAprPct: number | undefined;
        let shortFundingAprPct: number | undefined;
        let readerPoolUsdWithoutPnl: number | undefined;
        let readerReservedUsdLong: number | undefined;
        let readerReservedUsdShort: number | undefined;
        let readerLongPnlToPoolFactor: number | undefined;
        let readerShortPnlToPoolFactor: number | undefined;
        let readerAvailableLongUsd: number | undefined;
        let readerAvailableShortUsd: number | undefined;
        try {
          const reader = new Contract(basefx100Sepolia0312.contracts.READER, READER_ABI, provider);
          const marketInfo = await reader.getMarketInfo(
            basefx100Sepolia0312.contracts.DATA_STORE,
            {
              indexTokenPrice: { min: oraclePriceUsd, max: oraclePriceUsd },
              collateralTokenPrice: { min: BigInt("1000000000000000000000000000000"), max: BigInt("1000000000000000000000000000000") },
            },
            BigInt(marketIndex),
          );
          const longRaw = BigInt(marketInfo.nextFunding.longFundingFactorPerSecond);
          const shortRaw = BigInt(marketInfo.nextFunding.shortFundingFactorPerSecond);
          longFundingAprPct = annualizedFactorPercent(longRaw);
          shortFundingAprPct = annualizedFactorPercent(shortRaw);
          readerPoolUsdWithoutPnl = usdValue(BigInt(marketInfo.poolUsdWithoutPnl));
          readerReservedUsdLong = usdValue(BigInt(marketInfo.reservedUsdLong));
          readerReservedUsdShort = usdValue(BigInt(marketInfo.reservedUsdShort));
          readerLongPnlToPoolFactor = factorToPercent(BigInt(marketInfo.longPnlToPoolFactor));
          readerShortPnlToPoolFactor = factorToPercent(BigInt(marketInfo.shortPnlToPoolFactor));
          readerAvailableLongUsd = usdValue(BigInt(marketInfo.availableLongUsd));
          readerAvailableShortUsd = usdValue(BigInt(marketInfo.availableShortUsd));
        } catch {}

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
          constantPriceSpreadPct: factorToPercent(constantPriceSpreadRaw),
          positionImpactFactorPositive: factorToRatio(positionImpactFactorPositiveRaw),
          positionImpactFactorNegative: factorToRatio(positionImpactFactorNegativeRaw),
          positionImpactExponentPositive: factorToRatio(positionImpactExponentPositiveRaw),
          positionImpactExponentNegative: factorToRatio(positionImpactExponentNegativeRaw),
          maxPositionImpactFactorPositivePct: factorToPercent(maxPositionImpactFactorPositiveRaw),
          maxPositionImpactFactorNegativePct: factorToPercent(maxPositionImpactFactorNegativeRaw),
          priceImpactParameter: factorToRatio(priceImpactParameterRaw),
          poolCollateralAmount: round(Number(formatUnits(poolCollateralAmountRaw, collateralTokenDecimals)), 4),
          poolUsdWithoutPnl: typeof readerPoolUsdWithoutPnl === "number" ? readerPoolUsdWithoutPnl : round(Number(formatUnits(poolCollateralAmountRaw, collateralTokenDecimals)), 4),
          positionCollateralUsd: 0,
          longPnlToPoolFactor: typeof readerLongPnlToPoolFactor === "number" ? readerLongPnlToPoolFactor : 0,
          shortPnlToPoolFactor: typeof readerShortPnlToPoolFactor === "number" ? readerShortPnlToPoolFactor : 0,
          longPositionCollateralUsd: 0,
          shortPositionCollateralUsd: 0,
          longCumulativeOpenCostsUsd: usdValue(longCumulativeOpenCostsRaw),
          shortCumulativeOpenCostsUsd: usdValue(shortCumulativeOpenCostsRaw),
          maxOpenInterestLongUsd: usdValue(maxOpenInterestLongRaw),
          maxOpenInterestShortUsd: usdValue(maxOpenInterestShortRaw),
          maxOpenInterestFactorLongPct: factorToPercent(maxOpenInterestFactorLongRaw),
          maxOpenInterestFactorShortPct: factorToPercent(maxOpenInterestFactorShortRaw),
          bidDepthUsd: usdValue(bidDepthRaw),
          askDepthUsd: usdValue(askDepthRaw),
          reserveFactorLongPct: factorToPercent(reserveFactorLongRaw),
          reserveFactorShortPct: factorToPercent(reserveFactorShortRaw),
          openInterestReserveFactorLongPct: factorToPercent(openInterestReserveFactorLongRaw),
          openInterestReserveFactorShortPct: factorToPercent(openInterestReserveFactorShortRaw),
          longReservedUsd: typeof readerReservedUsdLong === "number" ? readerReservedUsdLong : 0,
          shortReservedUsd: typeof readerReservedUsdShort === "number" ? readerReservedUsdShort : 0,
          availableLongUsd: typeof readerAvailableLongUsd === "number" ? readerAvailableLongUsd : 0,
          availableShortUsd: typeof readerAvailableShortUsd === "number" ? readerAvailableShortUsd : 0,
          minCollateralFactorPct: factorToPercent(minCollateralFactorRaw),
          minCollateralFactorForOpenInterestMultiplierLongPct: factorToPercent(minCollateralFactorForOpenInterestMultiplierLongRaw),
          minCollateralFactorForOpenInterestMultiplierShortPct: factorToPercent(minCollateralFactorForOpenInterestMultiplierShortRaw),
          minCollateralUsd: usdValue(minCollateralUsdRaw),
          minCollateralFactorForLiquidationPct: factorToPercent(minCollateralFactorForLiquidationRaw),
          minPositionSizeUsd: usdValue(minPositionSizeUsdRaw),
          maxPositionSizeUsd: usdValue(maxPositionSizeUsdRaw),
          liquidationGraceBaseMinutes: round(Number(liquidationGracePeriodBaseRaw) / 60, 2),
          liquidationFeeFactorPct: factorToPercent(liquidationFeeFactorRaw),
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
          longFundingAprPct,
          shortFundingAprPct,
          longNegativeFundingFeePerSizePct: factorToPercentSigned(longNegativeFundingFeePerSizeRaw),
          longPositiveFundingFeePerSizePct: factorToPercentSigned(longPositiveFundingFeePerSizeRaw),
          shortNegativeFundingFeePerSizePct: factorToPercentSigned(shortNegativeFundingFeePerSizeRaw),
          shortPositiveFundingFeePerSizePct: factorToPercentSigned(shortPositiveFundingFeePerSizeRaw),
          oraclePriceUsd,
          // OPEN_INTEREST_IN_TOKENS is stored using token precision matching sizeInTokens.
          longOiTokens: Number(longOiTokensRaw),
          shortOiTokens: Number(shortOiTokensRaw),
        } satisfies OnchainMarketState;
      }),
    );
    const onchainMarkets = onchainMarketsRaw.filter((market): market is OnchainMarketState => market !== null);

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
    state.maxOracleRefPriceDeviationFactorPct = factorToPercent(maxOracleRefPriceDeviationFactorRaw);
    state.maxPriceImpactSpreadPct = factorToPercent(maxPriceImpactSpreadRaw);
    state.skewImpactFactor = factorToRatioSigned(skewImpactFactorRaw);
    state.minSkewImpact = factorToRatioSigned(minSkewImpactRaw);
    state.maxSkewImpact = factorToRatioSigned(maxSkewImpactRaw);
    const [
      multichainReadChannelRaw,
      feeDistributorDistributionDayRaw,
      feeDistributorDistributionTimestampRaw,
      feeDistributorStateRaw,
      feeDistributorMaxReferralRewardsWntUsdAmountRaw,
      feeDistributorMaxReferralRewardsWntUsdFactorRaw,
      feeDistributorMaxReferralRewardsEsgmxAmountRaw,
      feeDistributorGmxPriceRaw,
      feeDistributorWntPriceRaw,
      feeDistributorMaxReadResponseDelayRaw,
      feeDistributorGasLimitRaw,
      feeDistributorChainIdRaw,
      feeDistributorTotalFeeAmountGmxRaw,
      feeDistributorFeeAmountUsdV1Raw,
      feeDistributorFeeAmountUsdV2Raw,
      feeDistributorTotalStakedGmxRaw,
      feeDistributorReadResponseTimestampRaw,
      feeDistributorChainlinkFactorRaw,
      feeDistributorMaxWntAmountFromTreasuryRaw,
      feeDistributorV1FeesWntFactorRaw,
      feeDistributorV2FeesWntFactorRaw,
      feeDistributorReferralRewardsAmountCoreUsdcRaw,
      feeDistributorReferralRewardsDepositedCoreUsdcRaw,
      feeDistributorFeeAmountGmxForCurrentChainRaw,
      feeDistributorStakedGmxForCurrentChainRaw,
      feeDistributorBridgeSlippageFactorRaw,
      feeDistributorLayerZeroChainIdRaw,
    ] = await Promise.all([
      readUint(provider, DATA_KEYS.MULTICHAIN_READ_CHANNEL),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_DISTRIBUTION_DAY),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_DISTRIBUTION_TIMESTAMP),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_STATE),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_AMOUNT),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_WNT_USD_FACTOR),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_MAX_REFERRAL_REWARDS_ESGMX_AMOUNT),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_GMX_PRICE),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_WNT_PRICE),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_MAX_READ_RESPONSE_DELAY),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_GAS_LIMIT),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_CHAIN_ID),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_TOTAL_FEE_AMOUNT_GMX),
      readUint(provider, scopedUintKey(DATA_KEYS.FEE_DISTRIBUTOR_FEE_AMOUNT_USD, 1)),
      readUint(provider, scopedUintKey(DATA_KEYS.FEE_DISTRIBUTOR_FEE_AMOUNT_USD, 2)),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_TOTAL_STAKED_GMX),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_READ_RESPONSE_TIMESTAMP),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_CHAINLINK_FACTOR),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_MAX_WNT_AMOUNT_FROM_TREASURY),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_V1_FEES_WNT_FACTOR),
      readUint(provider, DATA_KEYS.FEE_DISTRIBUTOR_V2_FEES_WNT_FACTOR),
      readUint(provider, scopedAddressKey(DATA_KEYS.FEE_DISTRIBUTOR_REFERRAL_REWARDS_AMOUNT, basefx100Sepolia0312.tokens.CORE_USDC)),
      readUint(provider, scopedAddressKey(DATA_KEYS.FEE_DISTRIBUTOR_REFERRAL_REWARDS_DEPOSITED, basefx100Sepolia0312.tokens.CORE_USDC)),
      readUint(provider, scopedUintKey(DATA_KEYS.FEE_DISTRIBUTOR_FEE_AMOUNT_GMX, chainId.chainId)),
      readUint(provider, scopedUintKey(DATA_KEYS.FEE_DISTRIBUTOR_STAKED_GMX, chainId.chainId)),
      readUint(provider, scopedUintKey(DATA_KEYS.FEE_DISTRIBUTOR_BRIDGE_SLIPPAGE_FACTOR, chainId.chainId)),
      readUint(provider, scopedUintKey(DATA_KEYS.FEE_DISTRIBUTOR_LAYERZERO_CHAIN_ID, chainId.chainId)),
    ]);

    const multichainPeerForReadChannelRaw = await readBytes32(provider, scopedUintKey(DATA_KEYS.MULTICHAIN_PEERS, multichainReadChannelRaw));
    const multichainConfirmationsForReadChannelRaw = await readUint(provider, scopedUintKey(DATA_KEYS.MULTICHAIN_CONFIRMATIONS, multichainReadChannelRaw));
    const [feeDistributorChainIdsRaw, keeperCostAddresses, keeperCostTargetsRaw, keeperCostV2Raw, deployerAuthorizedRaw, orderKeeperAuthorizedRaw] = await Promise.all([
      readUintArray(provider, DATA_KEYS.FEE_DISTRIBUTOR_CHAIN_ID),
      readAddressArray(provider, DATA_KEYS.FEE_DISTRIBUTOR_KEEPER_COSTS),
      readUintArray(provider, DATA_KEYS.FEE_DISTRIBUTOR_KEEPER_COSTS),
      readBoolArray(provider, DATA_KEYS.FEE_DISTRIBUTOR_KEEPER_COSTS),
      readBool(provider, scopedAddressKey(DATA_KEYS.MULTICHAIN_AUTHORIZED_ORIGINATORS, basefx100Sepolia0312.operators.deployer)),
      readBool(provider, scopedAddressKey(DATA_KEYS.MULTICHAIN_AUTHORIZED_ORIGINATORS, basefx100Sepolia0312.operators.orderKeeper)),
    ]);

    state.distributionRegistry = [
      {
        title: "Authorized Originator Probes",
        description: "Probe-only view for configured operator addresses. The MULTICHAIN_AUTHORIZED_ORIGINATORS mapping is not enumerable onchain.",
        businessMeaning: "Checks whether expected operators are authorized as multichain originators.",
        runtimeStatus: "Probe-only registry view backed by onchain mapping reads.",
        rows: [
          { label: "Deployer authorized", value: deployerAuthorizedRaw, source: "onchain", detail: basefx100Sepolia0312.operators.deployer },
          { label: "Order keeper authorized", value: orderKeeperAuthorizedRaw, source: "onchain", detail: basefx100Sepolia0312.operators.orderKeeper },
        ],
      },
      {
        title: "Fee Distributor Chain Registry",
        description: "Enumerable chain IDs stored under FEE_DISTRIBUTOR_CHAIN_ID.",
        businessMeaning: "Shows which destination/source chains are registered in fee-distribution state.",
        runtimeStatus: "Enumerable registry pulled directly from onchain array state.",
        rows: feeDistributorChainIdsRaw.map((chainIdValue, index) => ({
          label: `Registered chain ${index + 1}`,
          value: Number(chainIdValue),
          source: "onchain",
          detail: `Fee distributor chainId index ${index}`,
        })),
      },
      {
        title: "Fee Distributor Keeper Registry",
        description: "Parallel arrays from FEE_DISTRIBUTOR_KEEPER_COSTS showing keeper addresses, target balances, and v2 flags.",
        businessMeaning: "Shows keeper funding/target-balance registry used by the fee distributor.",
        runtimeStatus: "Enumerable registry pulled directly from onchain arrays.",
        rows: keeperCostAddresses.map((keeper, index) => ({
          label: `Keeper ${index + 1}`,
          value: keeper,
          source: "onchain",
          detail: `target=${round(Number(formatUnits(keeperCostTargetsRaw[index] ?? 0, 18)), 4)} WNT, v2=${keeperCostV2Raw[index] ? "true" : "false"}`,
        })),
      },
      {
        title: "Fee Distributor Address Probes",
        description: "Configured probes for FEE_DISTRIBUTOR_ADDRESS_INFO and FEE_DISTRIBUTOR_ADDRESS_INFO_FOR_CHAIN. Names remain configurable because the mapping is not enumerable onchain.",
        businessMeaning: "Probe-only view for named distributor address mappings.",
        runtimeStatus: "Probe-only because address-name mapping is not enumerable onchain.",
        rows: [],
      },
    ];

    state.distributionOpsCurrent = {
      multichainReadChannel: Number(multichainReadChannelRaw),
      multichainPeerForReadChannel: multichainPeerForReadChannelRaw,
      multichainConfirmationsForReadChannel: Number(multichainConfirmationsForReadChannelRaw),
      feeDistributorDistributionDay: Number(feeDistributorDistributionDayRaw),
      feeDistributorDistributionTimestamp: Number(feeDistributorDistributionTimestampRaw),
      feeDistributorState: Number(feeDistributorStateRaw),
      feeDistributorMaxReadResponseDelaySec: Number(feeDistributorMaxReadResponseDelayRaw),
      feeDistributorGasLimit: Number(feeDistributorGasLimitRaw),
      feeDistributorChainId: Number(feeDistributorChainIdRaw),
      feeDistributorReadResponseTimestamp: Number(feeDistributorReadResponseTimestampRaw),
      feeDistributorMaxReferralRewardsWntUsdAmount: round(Number(formatUnits(feeDistributorMaxReferralRewardsWntUsdAmountRaw, USD_DECIMALS)), 2),
      feeDistributorMaxReferralRewardsWntUsdFactorPct: factorToPercent(feeDistributorMaxReferralRewardsWntUsdFactorRaw),
      feeDistributorMaxReferralRewardsEsgmxAmount: round(Number(formatUnits(feeDistributorMaxReferralRewardsEsgmxAmountRaw, 18)), 4),
      feeDistributorGmxPriceUsd: round(Number(formatUnits(feeDistributorGmxPriceRaw, USD_DECIMALS)), 2),
      feeDistributorWntPriceUsd: round(Number(formatUnits(feeDistributorWntPriceRaw, USD_DECIMALS)), 2),
      feeDistributorChainlinkFactorPct: factorToPercent(feeDistributorChainlinkFactorRaw),
      feeDistributorMaxWntAmountFromTreasury: round(Number(formatUnits(feeDistributorMaxWntAmountFromTreasuryRaw, 18)), 4),
      feeDistributorV1FeesWntFactorPct: factorToPercent(feeDistributorV1FeesWntFactorRaw),
      feeDistributorV2FeesWntFactorPct: factorToPercent(feeDistributorV2FeesWntFactorRaw),
      feeDistributorFeeAmountGmxForCurrentChain: round(Number(formatUnits(feeDistributorFeeAmountGmxForCurrentChainRaw, 18)), 4),
      feeDistributorTotalFeeAmountGmx: round(Number(formatUnits(feeDistributorTotalFeeAmountGmxRaw, 18)), 4),
      feeDistributorFeeAmountUsdV1: round(Number(formatUnits(feeDistributorFeeAmountUsdV1Raw, USD_DECIMALS)), 2),
      feeDistributorFeeAmountUsdV2: round(Number(formatUnits(feeDistributorFeeAmountUsdV2Raw, USD_DECIMALS)), 2),
      feeDistributorStakedGmxForCurrentChain: round(Number(formatUnits(feeDistributorStakedGmxForCurrentChainRaw, 18)), 4),
      feeDistributorTotalStakedGmx: round(Number(formatUnits(feeDistributorTotalStakedGmxRaw, 18)), 4),
      feeDistributorBridgeSlippageFactorPct: factorToPercent(feeDistributorBridgeSlippageFactorRaw),
      feeDistributorLayerZeroChainId: Number(feeDistributorLayerZeroChainIdRaw),
      feeDistributorReferralRewardsAmountCoreUsdc: round(Number(formatUnits(feeDistributorReferralRewardsAmountCoreUsdcRaw, 6)), 2),
      feeDistributorReferralRewardsDepositedCoreUsdc: round(Number(formatUnits(feeDistributorReferralRewardsDepositedCoreUsdcRaw, 6)), 2),
    };

    state.protocolOpsCurrent = {
      minOracleSigners: Number(minOracleSignersRaw),
      minOracleBlockConfirmations: Number(minOracleBlockConfirmationsRaw),
      maxOraclePriceAgeSec: Number(maxOraclePriceAgeRaw),
      maxAtomicOraclePriceAgeSec: Number(maxAtomicOraclePriceAgeRaw),
      maxOracleTimestampRangeSec: Number(maxOracleTimestampRangeRaw),
      sequencerGraceDurationSec: Number(sequencerGraceDurationRaw),
      maxOracleRefPriceDeviationPct: factorToPercent(maxOracleRefPriceDeviationFactorRaw),
      createDepositGasLimit: Number(createDepositGasLimitRaw),
      depositGasLimit: Number(depositGasLimitRaw),
      createWithdrawalGasLimit: Number(createWithdrawalGasLimitRaw),
      withdrawalGasLimit: Number(withdrawalGasLimitRaw),
      singleSwapGasLimit: Number(singleSwapGasLimitRaw),
      increaseOrderGasLimit: Number(increaseOrderGasLimitRaw),
      decreaseOrderGasLimit: Number(decreaseOrderGasLimitRaw),
      swapOrderGasLimit: Number(swapOrderGasLimitRaw),
      tokenTransferGasLimit: Number(tokenTransferGasLimitRaw),
      nativeTokenTransferGasLimit: Number(nativeTokenTransferGasLimitRaw),
      createOrderDisabled,
      executeOrderDisabled,
      updateOrderDisabled,
      cancelOrderDisabled,
      createDepositDisabled,
      executeDepositDisabled,
      createWithdrawalDisabled,
      executeWithdrawalDisabled,
      subaccountDisabled,
      gaslessDisabled,
    };
    const positionCount = Number(await dataStoreCall<bigint>(provider, "getBytes32Count", [DATA_KEYS.POSITION_LIST]));
    if (positionCount > 0) {
      const positionKeys = await readBytes32ValuesAt(provider, DATA_KEYS.POSITION_LIST, 0, positionCount);
      const collateralByMarket = new Map<number, number>();
      const longCollateralByMarket = new Map<number, number>();
      const shortCollateralByMarket = new Map<number, number>();
      const marketDecimals = new Map(onchainMarkets.map((market) => [market.marketIndex, market.collateralTokenDecimals] as const));
      const positionStates = await Promise.all(positionKeys.map(async (positionKey) => {
        const [marketIndexRaw, collateralAmountRaw, isLong] = await Promise.all([
          readUint(provider, compositeBytes32Key(positionKey, POSITION_FIELD_KEYS.MARKET_INDEX)),
          readUint(provider, compositeBytes32Key(positionKey, POSITION_FIELD_KEYS.COLLATERAL_AMOUNT)),
          readBool(provider, compositeBytes32Key(positionKey, POSITION_FIELD_KEYS.IS_LONG)),
        ]);
        return {
          marketIndex: Number(marketIndexRaw),
          collateralAmountRaw,
          isLong,
        };
      }));
      for (const positionState of positionStates) {
        const decimals = marketDecimals.get(positionState.marketIndex);
        if (decimals === undefined) continue;
        const collateralUsd = Number(formatUnits(positionState.collateralAmountRaw, decimals));
        collateralByMarket.set(
          positionState.marketIndex,
          round((collateralByMarket.get(positionState.marketIndex) ?? 0) + collateralUsd, 4),
        );
        const sidedMap = positionState.isLong ? longCollateralByMarket : shortCollateralByMarket;
        sidedMap.set(
          positionState.marketIndex,
          round((sidedMap.get(positionState.marketIndex) ?? 0) + collateralUsd, 4),
        );
      }
      for (const market of onchainMarkets) {
        market.positionCollateralUsd = collateralByMarket.get(market.marketIndex) ?? 0;
        market.longPositionCollateralUsd = longCollateralByMarket.get(market.marketIndex) ?? 0;
        market.shortPositionCollateralUsd = shortCollateralByMarket.get(market.marketIndex) ?? 0;
      }
    }

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
        poolUsdWithoutPnl: round((market.askDepthUsd + market.bidDepthUsd) / 1000, 2),
        positionCollateralUsd: 0,
        longPnlToPoolFactor: 0,
        shortPnlToPoolFactor: 0,
        longPositionCollateralUsd: 0,
        shortPositionCollateralUsd: 0,
        longCumulativeOpenCostsUsd: 0,
        shortCumulativeOpenCostsUsd: 0,
        positionFeeFactorPct: round(market.positionFeeFactor * 100, 4),
        constantPriceSpreadPct: 0.01,
        positionImpactFactorPositive: 0.0002,
        positionImpactFactorNegative: 0.0002,
        positionImpactExponentPositive: 2,
        positionImpactExponentNegative: 2,
        maxPositionImpactFactorPositivePct: 0.5,
        maxPositionImpactFactorNegativePct: 0.5,
        priceImpactParameter: market.priceImpactParameter,
        bidDepthUsd: market.bidDepthUsd,
        askDepthUsd: market.askDepthUsd,
        maxOpenInterestFactorLongPct: 1000,
        maxOpenInterestFactorShortPct: 1000,
        reserveFactorLongPct: 25,
        reserveFactorShortPct: 25,
        openInterestReserveFactorLongPct: 25,
        openInterestReserveFactorShortPct: 25,
        longReservedUsd: 0,
        shortReservedUsd: 0,
        availableLongUsd: 0,
        availableShortUsd: 0,
        minCollateralFactorPct: round(market.minCollateralFactor * 100, 4),
        minCollateralFactorForOpenInterestMultiplierLongPct: round(market.minCollateralFactor * 100, 4),
        minCollateralFactorForOpenInterestMultiplierShortPct: round(market.minCollateralFactor * 100, 4),
        minCollateralUsd: market.minPositionSizeUsd,
        minCollateralFactorForLiquidationPct: round(market.minCollateralFactorForLiquidation * 100, 4),
        minPositionSizeUsd: market.minPositionSizeUsd,
        maxPositionSizeUsd: market.maxPositionSizeUsd,
        liquidationGraceBaseMinutes: 15,
        liquidationFeeFactorPct: 0.05,
        fundingSkewEmaMinutes: 20,
        fundingSkewEmaPct: 0,
        fundingSkewSampleIntervalMinutes: 20,
        fundingFloorAprPct: 10.95,
        fundingBaseAprPct: 28,
        minFundingAprPct: -12,
        maxFundingAprPct: 140,
        fundingUpdatedAt: undefined,
        fundingUpdatedAgoMinutes: undefined,
        longFundingAprPct: undefined,
        shortFundingAprPct: undefined,
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
    const poolCollateralAmount = marketState.poolUsdWithoutPnl > 0
      ? marketState.poolUsdWithoutPnl
      : (marketState.poolCollateralAmount > 0 ? marketState.poolCollateralAmount : marketState.collateralVaultBalance);
    const oraclePrice = marketState.oraclePriceUsd ?? configured?.referencePriceUsd ?? seed.referencePriceUsd ?? 1;
    const markPrice = configured?.referencePriceUsd ?? oraclePrice;
    const totalOiTokens = marketState.longOiTokens + marketState.shortOiTokens;
    const environmentHasValidatedOiPath = basefx100Sepolia0312.globals.verifiedLiveOiPath === true;
    const oiCounterStatus = totalOiTokens === 0
      ? "missing"
      : totalOiTokens <= 3
        ? "dust"
        : "usable";
    const hasUsableLiveOi = oiCounterStatus === "usable";
    const oiCounterReason = totalOiTokens === 0
      ? environmentHasValidatedOiPath
        ? "Protocol position counters are currently zero on this market. The fresh fork OI path has been validated with isolated traders, so monitor falls back only for this market snapshot."
        : "Protocol position counters are zero on this market, so monitor OI falls back to pool/depth inference."
      : totalOiTokens <= 3
        ? environmentHasValidatedOiPath
          ? `Protocol position counters exist (${marketState.longOiTokens} long / ${marketState.shortOiTokens} short) but remain too small for this snapshot. The environment OI path is validated, so monitor keeps using pool/depth inference until counters become material.`
          : `Protocol position counters exist (${marketState.longOiTokens} long / ${marketState.shortOiTokens} short) but remain dust-sized, so monitor OI still uses pool/depth inference.`
        : "Protocol position counters are materially populated and used as the primary OI source.";
    const longSharePct = hasUsableLiveOi
      ? round((marketState.longOiTokens / totalOiTokens) * 100, 1)
      : 50;
    const skewPct = hasUsableLiveOi ? round(longSharePct - (100 - longSharePct), 2) : 0;
    const inferredSkewPct = askDepthUsd + bidDepthUsd > 0
      ? round(((askDepthUsd - bidDepthUsd) / (askDepthUsd + bidDepthUsd)) * 100, 2)
      : 0;
    const effectiveSkewPct = hasUsableLiveOi
      ? skewPct
      : (Math.abs(fundingSkewEmaPct) > 0 ? fundingSkewEmaPct : inferredSkewPct);
    const fundingSignalSkewPct = Math.abs(fundingSkewEmaPct) > 0 ? fundingSkewEmaPct : effectiveSkewPct;
    const longOpenInterestTokens = tokenAmountToDisplay(marketState.longOiTokens);
    const shortOpenInterestTokens = tokenAmountToDisplay(marketState.shortOiTokens);
    const totalOpenInterestTokens = tokenAmountToDisplay(totalOiTokens);
    const longOpenInterestUsd = hasUsableLiveOi && marketState.longOiTokens > 0 ? round(tokenAmountToUsd(marketState.longOiTokens, oraclePrice), 2) : 0;
    const shortOpenInterestUsd = hasUsableLiveOi && marketState.shortOiTokens > 0 ? round(tokenAmountToUsd(marketState.shortOiTokens, oraclePrice), 2) : 0;
    const longReservedUsd = marketState.longReservedUsd > 0 ? marketState.longReservedUsd : longOpenInterestUsd;
    const shortReservedUsd = marketState.shortReservedUsd > 0 ? marketState.shortReservedUsd : marketState.shortCumulativeOpenCostsUsd;
    const inferredOpenInterestUsd = round(Math.min(maxPositionSizeUsd * 0.58, askDepthUsd * 0.52 + bidDepthUsd * 0.48), 0);
    const fallbackOpenInterestUsd = poolCollateralAmount > 0
      ? round(Math.min(inferredOpenInterestUsd, poolCollateralAmount * 0.65), 2)
      : 0;
    const openInterestUsd = hasUsableLiveOi
      ? round(tokenAmountToUsd(totalOiTokens, oraclePrice), 2)
      : fallbackOpenInterestUsd;
    const openInterestCapacityUsd = marketState.maxOpenInterestLongUsd + marketState.maxOpenInterestShortUsd > 0
      ? marketState.maxOpenInterestLongUsd + marketState.maxOpenInterestShortUsd
      : maxPositionSizeUsd * 2;
    const longSoftCapUsd = round(poolCollateralAmount * (marketState.maxOpenInterestFactorLongPct / 100), 2);
    const shortSoftCapUsd = round(poolCollateralAmount * (marketState.maxOpenInterestFactorShortPct / 100), 2);
    const longReserveCapUsd = round(poolCollateralAmount * (marketState.reserveFactorLongPct / 100), 2);
    const shortReserveCapUsd = round(poolCollateralAmount * (marketState.reserveFactorShortPct / 100), 2);
    const longOiReserveCapUsd = round(poolCollateralAmount * (marketState.openInterestReserveFactorLongPct / 100), 2);
    const shortOiReserveCapUsd = round(poolCollateralAmount * (marketState.openInterestReserveFactorShortPct / 100), 2);
    const availableLongUsd = marketState.availableLongUsd > 0
      ? marketState.availableLongUsd
      : round(Math.max(0, Math.min(
        marketState.maxOpenInterestLongUsd > 0 ? marketState.maxOpenInterestLongUsd - marketState.longCumulativeOpenCostsUsd : Number.POSITIVE_INFINITY,
        longSoftCapUsd > 0 ? longSoftCapUsd - marketState.longCumulativeOpenCostsUsd : Number.POSITIVE_INFINITY,
        longReserveCapUsd > 0 ? longReserveCapUsd - longReservedUsd : Number.POSITIVE_INFINITY,
        longOiReserveCapUsd > 0 ? longOiReserveCapUsd - longReservedUsd : Number.POSITIVE_INFINITY,
      )), 2);
    const availableShortUsd = marketState.availableShortUsd > 0
      ? marketState.availableShortUsd
      : round(Math.max(0, Math.min(
        marketState.maxOpenInterestShortUsd > 0 ? marketState.maxOpenInterestShortUsd - marketState.shortCumulativeOpenCostsUsd : Number.POSITIVE_INFINITY,
        shortSoftCapUsd > 0 ? shortSoftCapUsd - marketState.shortCumulativeOpenCostsUsd : Number.POSITIVE_INFINITY,
        shortReserveCapUsd > 0 ? shortReserveCapUsd - shortReservedUsd : Number.POSITIVE_INFINITY,
        shortOiReserveCapUsd > 0 ? shortOiReserveCapUsd - shortReservedUsd : Number.POSITIVE_INFINITY,
      )), 2);
    const openInterestUtilizationPct = openInterestCapacityUsd > 0 ? round((openInterestUsd / openInterestCapacityUsd) * 100, 2) : 0;
    const poolUtilizationPct = poolCollateralAmount > 0 ? round((openInterestUsd / poolCollateralAmount) * 100, 2) : 0;
    const fundingBenchmarkAprPct = deriveFundingBenchmarkAprPct(fundingBaseAprPct, fundingFloorAprPct, minFundingAprPct, maxFundingAprPct, fundingSignalSkewPct, openInterestUtilizationPct);
    const directLongFundingAprPct = marketState.longFundingAprPct ?? fundingBenchmarkAprPct;
    const directShortFundingAprPct = marketState.shortFundingAprPct ?? fundingBenchmarkAprPct;
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
      hasLiveOi: hasUsableLiveOi,
      hasRuntimeProtocolSignal,
    });
    const riskScore = analytics.riskScore;
    const alertLevel = analytics.alertLevel;
    const realizedVol1hPct = analytics.realizedVol1hPct;
    const volLimitPct = analytics.volLimitPct;
    const fundingAprPct = round(Math.max(directLongFundingAprPct, directShortFundingAprPct), 2);

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
      longOpenInterestTokens,
      shortOpenInterestTokens,
      oiChange24hPct,
      fundingRateHourlyPct: round(fundingAprPct / (365 * 24), 4),
      fundingAprPct,
      longFundingAprPct: directLongFundingAprPct,
      shortFundingAprPct: directShortFundingAprPct,
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
      poolUsdWithoutPnl: marketState.poolUsdWithoutPnl > 0 ? marketState.poolUsdWithoutPnl : poolCollateralAmount,
      positionCollateralUsd: marketState.positionCollateralUsd,
      longPnlToPoolFactor: marketState.longPnlToPoolFactor,
      shortPnlToPoolFactor: marketState.shortPnlToPoolFactor,
      longPositionCollateralUsd: marketState.longPositionCollateralUsd,
      shortPositionCollateralUsd: marketState.shortPositionCollateralUsd,
      longOpenInterestUsd,
      shortOpenInterestUsd,
      openInterestCapacityUsd,
      openInterestUtilizationPct,
      poolUtilizationPct,
      positionFeeFactorPct,
      priceImpactParameter,
      bidDepthUsd,
      askDepthUsd,
      reserveFactorLongPct: marketState.reserveFactorLongPct,
      reserveFactorShortPct: marketState.reserveFactorShortPct,
      openInterestReserveFactorLongPct: marketState.openInterestReserveFactorLongPct,
      openInterestReserveFactorShortPct: marketState.openInterestReserveFactorShortPct,
      longReservedUsd,
      shortReservedUsd,
      availableLongUsd,
      availableShortUsd,
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
  const totalMarketCollateral = markets.reduce((sum, market) => sum + market.positionCollateralUsd, 0);
  const uniqueVaultCollateral = new Map<string, number>();
  for (const market of markets) {
    if (!uniqueVaultCollateral.has(market.vault)) {
      uniqueVaultCollateral.set(market.vault, market.poolCollateralAmount);
    }
  }
  const totalPoolCollateral = Array.from(uniqueVaultCollateral.values()).reduce((sum, value) => sum + value, 0);
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
      value: formatCurrency(totalPoolCollateral),
      delta: (() => {
        if (totalPoolCollateral <= 0) return "live pool balance unavailable";
        return `${round((totalOi / Math.max(totalPoolCollateral, 1)) * 100, 1)}% OI-to-pool`;
      })(),
      tone: markets.some((market) => market.poolUtilizationPct > 80) ? "critical" : "good",
    },
    {
      label: "Total Market Collateral",
      value: formatCurrency(totalMarketCollateral),
      delta: markets.length > 0 ? `${markets.filter((market) => market.positionCollateralUsd > 0).length}/${markets.length} markets with open collateral` : "No active markets",
      tone: totalMarketCollateral > 0 ? "good" : "neutral",
    },
    {
      label: "Funding Markets Above Venue",
      value: `${markets.filter((market) => Math.max(market.longFundingAprPct, market.shortFundingAprPct) > market.externalFundingAprPct).length}/${markets.length}`,
      delta: markets.length > 0 ? `Long ${round(Math.max(...markets.map((market) => market.longFundingAprPct)), 2)}% · Short ${round(Math.max(...markets.map((market) => market.shortFundingAprPct)), 2)}% max` : `No active markets`,
      tone: markets.some((market) => Math.max(market.longFundingAprPct, market.shortFundingAprPct) > market.externalFundingAprPct) ? "warning" : "good",
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
    let description = `Funding max side APR at ${round(market.fundingAprPct, 1)}% (long ${round(market.longFundingAprPct, 1)}% / short ${round(market.shortFundingAprPct, 1)}%) is ${fundingSpread >= 0 ? "above" : "below"} ${market.externalVenueName} baseline ${round(market.externalFundingAprPct, 1)}% (${market.externalFundingSource === "live-venue" ? "live venue" : "runtime benchmark"}).`;
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
        description: `Funding state has not updated for ${market.fundingUpdatedAgoMinutes.toFixed(1)} minutes. Reader next funding is long ${round(market.longFundingAprPct, 2)}% / short ${round(market.shortFundingAprPct, 2)}% APR with skew EMA ${market.fundingSkewEmaPct.toFixed(2)}%.`,
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
  const liveMarketsBySymbol = new Map(liveState.onchainMarkets.map((market) => [market.symbol, market]));
  const maxOracleRefPriceDeviationPct = liveState.readStatus === "fallback"
    ? basefx100Sepolia0312.globals.maxOracleRefPriceDeviationFactor * 100
    : (liveState.maxOracleRefPriceDeviationFactorPct ?? basefx100Sepolia0312.globals.maxOracleRefPriceDeviationFactor * 100);

  return markets.map((market) => {
    const liveMarket = liveMarketsBySymbol.get(market.symbol);
    const template = cloneTemplate(tierTemplates[market.tier] ?? tierTemplates["Tier 2"]);
    const baselineSources = buildSourceSet(template, "template");
    const current: ParameterValueSet = {
      ...template,
      openFeeRatio: market.positionFeeFactorPct,
      closeFeeRatio: market.positionFeeFactorPct,
      constantSpread: liveMarket?.constantPriceSpreadPct ?? template.constantSpread,
      liquidationFeeFactor: liveMarket?.liquidationFeeFactorPct ?? template.liquidationFeeFactor,
      maxPriceDeviation: maxOracleRefPriceDeviationPct,
      priceImpactNormal: market.priceImpactParameter,
      priceImpactEmergency: round(market.priceImpactParameter * 1.7, 2),
      maxPriceImpactSpread: liveState.readStatus === "fallback"
        ? basefx100Sepolia0312.globals.maxPriceImpactSpread * 100
        : (liveState.maxPriceImpactSpreadPct ?? basefx100Sepolia0312.globals.maxPriceImpactSpread * 100),
      positionImpactFactorPositive: liveMarket?.positionImpactFactorPositive ?? template.positionImpactFactorPositive,
      positionImpactFactorNegative: liveMarket?.positionImpactFactorNegative ?? template.positionImpactFactorNegative,
      positionImpactExponentPositive: liveMarket?.positionImpactExponentPositive ?? template.positionImpactExponentPositive,
      positionImpactExponentNegative: liveMarket?.positionImpactExponentNegative ?? template.positionImpactExponentNegative,
      maxPositionImpactFactorPositive: liveMarket?.maxPositionImpactFactorPositivePct ?? template.maxPositionImpactFactorPositive,
      maxPositionImpactFactorNegative: liveMarket?.maxPositionImpactFactorNegativePct ?? template.maxPositionImpactFactorNegative,
      minPosUsd: liveMarket?.minPositionSizeUsd ?? template.minPosUsd,
      minCollateralUsd: liveMarket?.minCollateralUsd ?? template.minCollateralUsd,
      singlePosCapUsd: market.maxPositionSizeUsd,
      globalCapUsd: market.maxPositionSizeUsd * 4,
      maxOpenInterestFactorLong: liveMarket?.maxOpenInterestFactorLongPct ?? template.maxOpenInterestFactorLong,
      maxOpenInterestFactorShort: liveMarket?.maxOpenInterestFactorShortPct ?? template.maxOpenInterestFactorShort,
      fundingFloorApr: market.fundingFloorAprPct,
      fundingBaseApr: market.fundingBaseAprPct,
      fundingEmergencyApr: market.maxFundingAprPct,
      minFundingRate: market.minFundingAprPct,
      maxFundingRate: market.maxFundingAprPct,
      reserveFactor: liveMarket
        ? round((liveMarket.reserveFactorLongPct + liveMarket.reserveFactorShortPct) / 2, 4)
        : template.reserveFactor,
      reserveFactorLong: liveMarket?.reserveFactorLongPct ?? template.reserveFactorLong,
      reserveFactorShort: liveMarket?.reserveFactorShortPct ?? template.reserveFactorShort,
      oiReserveFactorLong: liveMarket?.openInterestReserveFactorLongPct ?? template.oiReserveFactorLong,
      oiReserveFactorShort: liveMarket?.openInterestReserveFactorShortPct ?? template.oiReserveFactorShort,
      minCollateralFactor: market.minCollateralFactorPct,
      minCollateralFactorForOIMultiplierLong:
        liveMarket?.minCollateralFactorForOpenInterestMultiplierLongPct ?? template.minCollateralFactorForOIMultiplierLong,
      minCollateralFactorForOIMultiplierShort:
        liveMarket?.minCollateralFactorForOpenInterestMultiplierShortPct ?? template.minCollateralFactorForOIMultiplierShort,
      orderbookDepthLong: market.askDepthUsd,
      orderbookDepthShort: market.bidDepthUsd,
      minOrderbookDepthLong: round(market.askDepthUsd * 0.72, 2),
      minOrderbookDepthShort: round(market.bidDepthUsd * 0.72, 2),
      maxOrderbookDepthLong: round(market.askDepthUsd * 1.22, 2),
      maxOrderbookDepthShort: round(market.bidDepthUsd * 1.22, 2),
      skewEmaMinutes: market.fundingSkewEmaMinutes,
      skewImpactFactor: liveState.skewImpactFactor ?? template.skewImpactFactor,
      skewClampLiveMin: liveState.minSkewImpact ?? template.skewClampLiveMin,
      skewClampLiveMax: liveState.maxSkewImpact ?? template.skewClampLiveMax,
      graceBaseMinutes: liveMarket?.liquidationGraceBaseMinutes ?? template.graceBaseMinutes,
      lpNavUsd: liveState.lpVaultUsdcBalance ?? 0,
    };

    const currentSources = buildSourceSet(template, "template");
    assignSource(currentSources, [
      "openFeeRatio",
      "closeFeeRatio",
      "constantSpread",
      "liquidationFeeFactor",
      "priceImpactNormal",
      "maxPriceImpactSpread",
      "positionImpactFactorPositive",
      "positionImpactFactorNegative",
      "positionImpactExponentPositive",
      "positionImpactExponentNegative",
      "maxPositionImpactFactorPositive",
      "maxPositionImpactFactorNegative",
      "fundingFloorApr",
      "fundingBaseApr",
      "fundingEmergencyApr",
      "minFundingRate",
      "maxFundingRate",
      "maxOpenInterestFactorLong",
      "maxOpenInterestFactorShort",
      "reserveFactor",
      "reserveFactorLong",
      "reserveFactorShort",
      "oiReserveFactorLong",
      "oiReserveFactorShort",
      "minCollateralFactor",
      "minCollateralFactorForOIMultiplierLong",
      "minCollateralFactorForOIMultiplierShort",
      "orderbookDepthLong",
      "orderbookDepthShort",
      "skewEmaMinutes",
      "skewImpactFactor",
      "skewClampLiveMin",
      "skewClampLiveMax",
      "minCollateralUsd",
      "singlePosCapUsd",
      "graceBaseMinutes",
    ], "onchain");

    assignSource(currentSources, ["maxPriceDeviation"], liveState.readStatus === "fallback" ? "config-fallback" : "onchain");
    assignSource(currentSources, [
      "priceImpactEmergency",
      "globalCapUsd",
      "minOrderbookDepthLong",
      "minOrderbookDepthShort",
      "maxOrderbookDepthLong",
      "maxOrderbookDepthShort",
    ], "derived");
    assignSource(currentSources, ["lpNavUsd"], liveState.readStatus === "fallback" ? "config-fallback" : "onchain");
    assignSource(currentSources, ["minPosUsd"], liveState.readStatus === "fallback" ? "config-fallback" : "onchain");

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

function buildProtocolOps(liveState: LiveReadState): ProtocolOpsSnapshot {
  const current: ParameterValueSet = liveState.protocolOpsCurrent ?? {
    minOracleSigners: 0,
    minOracleBlockConfirmations: 0,
    maxOraclePriceAgeSec: 0,
    maxAtomicOraclePriceAgeSec: 0,
    maxOracleTimestampRangeSec: 0,
    sequencerGraceDurationSec: 0,
    maxOracleRefPriceDeviationPct: basefx100Sepolia0312.globals.maxOracleRefPriceDeviationFactor * 100,
    createDepositGasLimit: 0,
    depositGasLimit: 0,
    createWithdrawalGasLimit: 0,
    withdrawalGasLimit: 0,
    singleSwapGasLimit: 0,
    increaseOrderGasLimit: 0,
    decreaseOrderGasLimit: 0,
    swapOrderGasLimit: 0,
    tokenTransferGasLimit: 0,
    nativeTokenTransferGasLimit: 0,
    createOrderDisabled: false,
    executeOrderDisabled: false,
    updateOrderDisabled: false,
    cancelOrderDisabled: false,
    createDepositDisabled: false,
    executeDepositDisabled: false,
    createWithdrawalDisabled: false,
    executeWithdrawalDisabled: false,
    subaccountDisabled: false,
    gaslessDisabled: false,
  };

  const source = liveState.readStatus === "fallback" ? "config-fallback" : "onchain";
  return {
    current,
    currentSources: buildSourceSet(current, source),
  };
}

function buildDistributionOps(liveState: LiveReadState): DistributionOpsSnapshot {
  const current: ParameterValueSet = liveState.distributionOpsCurrent ?? {
    multichainReadChannel: 0,
    multichainPeerForReadChannel: "0x0000000000000000000000000000000000000000000000000000000000000000",
    multichainConfirmationsForReadChannel: 0,
    feeDistributorDistributionDay: 0,
    feeDistributorDistributionTimestamp: 0,
    feeDistributorState: 0,
    feeDistributorMaxReadResponseDelaySec: 0,
    feeDistributorGasLimit: 0,
    feeDistributorChainId: 0,
    feeDistributorReadResponseTimestamp: 0,
    feeDistributorMaxReferralRewardsWntUsdAmount: 0,
    feeDistributorMaxReferralRewardsWntUsdFactorPct: 0,
    feeDistributorMaxReferralRewardsEsgmxAmount: 0,
    feeDistributorGmxPriceUsd: 0,
    feeDistributorWntPriceUsd: 0,
    feeDistributorChainlinkFactorPct: 0,
    feeDistributorMaxWntAmountFromTreasury: 0,
    feeDistributorV1FeesWntFactorPct: 0,
    feeDistributorV2FeesWntFactorPct: 0,
    feeDistributorFeeAmountGmxForCurrentChain: 0,
    feeDistributorTotalFeeAmountGmx: 0,
    feeDistributorFeeAmountUsdV1: 0,
    feeDistributorFeeAmountUsdV2: 0,
    feeDistributorStakedGmxForCurrentChain: 0,
    feeDistributorTotalStakedGmx: 0,
    feeDistributorBridgeSlippageFactorPct: 0,
    feeDistributorLayerZeroChainId: 0,
    feeDistributorReferralRewardsAmountCoreUsdc: 0,
    feeDistributorReferralRewardsDepositedCoreUsdc: 0,
  };

  const source = liveState.readStatus === "fallback" ? "config-fallback" : "onchain";
  return {
    current,
    currentSources: buildSourceSet(current, source),
  };
}

export async function buildMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const liveState = await loadLiveState();
  const { markets, marketSeries } = buildMarkets(liveState);
  const dashboard = buildDashboard(markets, liveState);
  const { alerts, actions, recovery } = buildAlerts(markets);
  const parameters = buildParameters(markets, liveState);
  const protocolOps = buildProtocolOps(liveState);
  const distributionOps = buildDistributionOps(liveState);
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
      writeEnabled: isWriteEnabled(),
    },
    dashboard,
    markets,
    marketSeries,
    alerts,
    actions,
    recovery,
    parameterDefinitions,
    parameters,
    protocolOpsDefinitions,
    protocolOps,
    distributionOpsDefinitions,
    distributionOps,
    distributionRegistry: liveState.distributionRegistry ?? [],
  };
}
