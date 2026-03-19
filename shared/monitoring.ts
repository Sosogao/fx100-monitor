export type AlertLevel = "normal" | "l1" | "l2" | "l3";
export type AlertStatus = "active" | "investigating" | "monitoring" | "resolved";
export type ActionStatus = "pending" | "executed" | "failed";
export type RecoveryStatus =
  | "triggered"
  | "acknowledged"
  | "action_executed"
  | "monitoring"
  | "partially_recovered"
  | "fully_recovered";

export interface EnvironmentInfo {
  name: string;
  network: string;
  mode: "demo-backed-api" | "live-read-only";
  source: string;
  updatedAt: string;
  refreshIntervalSec: number;
  chainId?: number;
  blockNumber?: number;
  readStatus: "live" | "fallback" | "mixed";
  writeEnabled?: boolean;
}

export interface MarketSnapshot {
  symbol: string;
  displayName: string;
  marketIndex: number;
  vault: string;
  indexToken: string;
  collateralToken: string;
  tier: string;
  alertLevel: AlertLevel;
  watchStatus: string;
  markPrice: number;
  oraclePrice: number;
  priceDeviationPct: number;
  externalVenueName: string;
  externalPriceUsd: number;
  externalIndexPriceUsd?: number;
  externalSpotPriceUsd?: number;
  externalMarkPriceUsd?: number;
  externalPriceDeviationPct: number;
  externalPriceSource: ExternalPriceSource;
  openInterestUsd: number;
  oiSource: "live-position-counters" | "pool-depth-inferred";
  oiCounterStatus: "usable" | "dust" | "missing";
  oiCounterReason: string;
  longOpenInterestTokens: number;
  shortOpenInterestTokens: number;
  oiChange24hPct: number;
  fundingRateHourlyPct: number;
  fundingAprPct: number;
  fundingSignalSource: "live-funding-state" | "runtime-benchmark";
  externalFundingAprPct: number;
  externalFundingSource: ExternalFundingSource;
  skewPct: number;
  fundingSkewEmaPct: number;
  fundingSkewSampleIntervalMinutes: number;
  longSharePct: number;
  shortSharePct: number;
  realizedVol1hPct: number;
  volLimitPct: number;
  riskScore: number;
  var99_9Pct: number;
  es99_9Pct: number;
  tailRatio: number;
  analyticsSource: MarketAnalyticsSource;
  collateralVaultBalance: number;
  indexVaultBalance: number;
  poolCollateralAmount: number;
  longOpenInterestUsd: number;
  shortOpenInterestUsd: number;
  openInterestCapacityUsd: number;
  openInterestUtilizationPct: number;
  poolUtilizationPct: number;
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
  fundingUpdatedAgoMinutes?: number;
  longNegativeFundingFeePerSizePct: number;
  longPositiveFundingFeePerSizePct: number;
  shortNegativeFundingFeePerSizePct: number;
  shortPositiveFundingFeePerSizePct: number;
  pinned: boolean;
}

export interface MetricPoint {
  time: string;
  value: number;
}

export interface MarketSeries {
  symbol: string;
  priceVolatility: MetricPoint[];
  fundingApr: MetricPoint[];
  openInterestUsd: MetricPoint[];
}

export interface DashboardStat {
  label: string;
  value: string;
  delta?: string;
  tone: "neutral" | "good" | "warning" | "critical";
}

export interface DashboardNote {
  title: string;
  body: string;
  tone: "good" | "warning" | "critical";
}

export interface DashboardOverview {
  stats: DashboardStat[];
  exposureSeries: MetricPoint[];
  priorityMarkets: MarketSnapshot[];
  notes: DashboardNote[];
}

export interface AlertRecord {
  id: string;
  level: AlertLevel;
  status: AlertStatus;
  category: string;
  assetSymbol: string;
  title: string;
  description: string;
  triggeredAt: string;
  metricValue: number;
  thresholdValue: number;
  signalSource: string;
  actionSummary: string;
}

export interface ActionRecord {
  id: string;
  alertId: string;
  assetSymbol: string;
  action: string;
  status: ActionStatus;
  timestamp: string;
  beforeValue: string;
  afterValue: string;
}

export interface RecoveryRecord {
  id: string;
  alertId: string;
  assetSymbol: string;
  level: AlertLevel;
  status: RecoveryStatus;
  triggeredAt: string;
  nextStep: string;
  etaMinutes: number;
  executedActions: string[];
}

export interface ParameterFieldDefinition {
  key: string;
  label: string;
  category: string;
  unit: string;
  keyName?: string;
  keyPath?: string;
  writable?: boolean;
  writableReason?: string;
  businessMeaning?: string;
  riskControlled?: string;
  formula?: string;
  runtimeStatus?: string;
  testStatus?: string;
}

export interface ParameterValueSet {
  [key: string]: string | number | boolean;
}

export type ParameterValueSource = "onchain" | "config-fallback" | "seeded-analytics" | "template" | "derived";
export type MarketAnalyticsSource = "runtime-derived" | "seeded-fallback";
export type ExternalPriceSource = "live-aggregate" | "live-index" | "live-spot" | "live-mark" | "oracle-fallback" | "config-reference";
export type ExternalFundingSource = "live-venue" | "runtime-benchmark";

export interface ParameterSourceSet {
  [key: string]: ParameterValueSource;
}

export interface ParameterSnapshot {
  symbol: string;
  tier: string;
  alertLevel: AlertLevel;
  current: ParameterValueSet;
  currentSources: ParameterSourceSet;
  baseline: ParameterValueSet;
  baselineSources: ParameterSourceSet;
  recommended: ParameterValueSet;
  recommendedSources: ParameterSourceSet;
}

export interface ProtocolOpsFieldDefinition {
  key: string;
  label: string;
  category: string;
  unit: string;
  keyName?: string;
  keyPath?: string;
  writable?: boolean;
  writableReason?: string;
  businessMeaning?: string;
  riskControlled?: string;
  formula?: string;
  runtimeStatus?: string;
  testStatus?: string;
}

export interface ProtocolOpsSnapshot {
  current: ParameterValueSet;
  currentSources: ParameterSourceSet;
}

export interface DistributionOpsFieldDefinition {
  key: string;
  label: string;
  category: string;
  unit: string;
}

export interface DistributionOpsSnapshot {
  current: ParameterValueSet;
  currentSources: ParameterSourceSet;
}

export interface DistributionRegistryRow {
  label: string;
  value: string | number | boolean;
  source: ParameterValueSource;
  detail?: string;
}

export interface DistributionRegistrySection {
  title: string;
  description: string;
  rows: DistributionRegistryRow[];
}

export interface MonitoringHistoryPoint {
  timestamp: string;
  totalOpenInterestUsd: number;
  markets: Array<{
    symbol: string;
    fundingAprPct: number;
    openInterestUsd: number;
    realizedVol1hPct: number;
  }>;
}

export interface MonitoringControlUpdateInput {
  surface: "parameters" | "protocol-ops";
  fieldKey: string;
  symbol?: string;
  value: string | number | boolean;
}

export interface MonitoringControlUpdateResult {
  ok: true;
  txHash: string;
  surface: "parameters" | "protocol-ops";
  fieldKey: string;
  symbol?: string;
  keyName: string;
  keyPath: string;
}

export interface MonitoringSnapshot {
  generatedAt: string;
  environment: EnvironmentInfo;
  dashboard: DashboardOverview;
  markets: MarketSnapshot[];
  marketSeries: MarketSeries[];
  alerts: AlertRecord[];
  actions: ActionRecord[];
  recovery: RecoveryRecord[];
  parameterDefinitions: ParameterFieldDefinition[];
  parameters: ParameterSnapshot[];
  protocolOpsDefinitions: ProtocolOpsFieldDefinition[];
  protocolOps: ProtocolOpsSnapshot;
  distributionOpsDefinitions: DistributionOpsFieldDefinition[];
  distributionOps: DistributionOpsSnapshot;
  distributionRegistry: DistributionRegistrySection[];
}
