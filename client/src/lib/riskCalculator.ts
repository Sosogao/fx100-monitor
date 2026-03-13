/**
 * Risk Calculator Module
 * Implements VaR/ES calculation, Risk Score computation, and alert rule engine
 */

// Real PriceChange_Param data from Google Sheets
export const PRICE_CHANGE_DATA: Record<string, any> = {
  'ETH-USD': {
    tier: 'Tier 1',
    timeframes: {
      '5s': { p99: 1.12810, p99_9: 0.17312, p99_99: 0.50860, p1: -5.65810, p0_1: -0.83011, p0_001: -2.00430 },
      '5m': { p99: 5.65810, p99_9: 0.83011, p99_99: 2.00430, p1: -9.65530, p0_1: -9.65530, p0_001: -11.75750 },
      '15m': { p99: 9.05530, p99_9: 2.00430, p99_99: 9.05530, p1: -24.23100, p0_1: -24.23100, p0_001: -24.23100 },
    }
  },
  'BTC-USD': {
    tier: 'Tier 1',
    timeframes: {
      '5s': { p99: 0.84656, p99_9: 0.10724, p99_99: 0.28679, p1: -3.47810, p0_1: -0.42838, p0_001: -1.50990 },
      '5m': { p99: 3.47810, p99_9: 0.42838, p99_99: 1.50990, p1: -5.94570, p0_1: -5.94570, p0_001: -8.88010 },
      '15m': { p99: 5.94570, p99_9: 1.50990, p99_99: 8.88010, p1: -15.32430, p0_1: -15.32430, p0_001: -20.56780 },
    }
  },
  'SOL-USD': {
    tier: 'Tier 2',
    timeframes: {
      '5s': { p99: 1.62720, p99_9: 0.19919, p99_99: 0.71600, p1: -11.39740, p0_1: -0.77447, p0_001: -13.69450 },
      '5m': { p99: 8.17780, p99_9: 0.73447, p99_99: 2.61600, p1: -13.69450, p0_1: -13.69450, p0_001: -37.21780 },
      '15m': { p99: 13.69450, p99_9: 2.61600, p99_99: 37.21780, p1: -37.21780, p0_1: -37.21780, p0_001: -37.21780 },
    }
  },
  'SUI-USD': {
    tier: 'Tier 3',
    timeframes: {
      '5s': { p99: 1.87140, p99_9: 0.23092, p99_99: 0.92860, p1: -24.23100, p0_1: -1.80447, p0_001: -34.44390 },
      '5m': { p99: 14.16100, p99_9: 1.80447, p99_99: 3.32800, p1: -24.23100, p0_1: -24.23100, p0_001: -34.44390 },
      '15m': { p99: 24.23100, p99_9: 3.32800, p99_99: 34.44390, p1: -34.44390, p0_1: -34.44390, p0_001: -34.44390 },
    }
  },
  'XRP-USD': {
    tier: 'Tier 2',
    timeframes: {
      '5s': { p99: 1.62096, p99_9: 0.21171, p99_99: 0.62408, p1: -16.81810, p0_1: -1.25807, p0_001: -28.13480 },
      '5m': { p99: 10.70180, p99_9: 1.25807, p99_99: 2.80480, p1: -16.81810, p0_1: -16.81810, p0_001: -28.13480 },
      '15m': { p99: 16.81810, p99_9: 2.80480, p99_99: 28.13480, p1: -28.13480, p0_1: -28.13480, p0_001: -28.13480 },
    }
  },
};

// Tier-based weight configuration
export const TIER_WEIGHTS: Record<string, Record<string, number>> = {
  'Tier 1': {
    var: 0.35,      // Higher weight for VaR - stricter
    es: 0.30,       // Higher weight for ES
    rv: 0.15,       // Lower weight for RV
    kurtosis: 0.10, // Lower weight for kurtosis
    maxLoss: 0.10,
  },
  'Tier 2': {
    var: 0.30,
    es: 0.25,
    rv: 0.20,
    kurtosis: 0.15,
    maxLoss: 0.10,
  },
  'Tier 3': {
    var: 0.25,      // Lower weight for VaR - more lenient
    es: 0.20,       // Lower weight for ES
    rv: 0.25,       // Higher weight for RV
    kurtosis: 0.20, // Higher weight for kurtosis
    maxLoss: 0.10,
  },
};

// Alert thresholds by tier and timeframe
export const ALERT_THRESHOLDS: Record<string, Record<string, Record<string, number>>> = {
  'Tier 1': {
    '5s': { l1: 0.99, l2: 0.999, l3: 0.9999 },    // P99, P99.9, P99.99
    '5m': { l1: 0.99, l2: 0.999, l3: 0.9999 },
    '15m': { l1: 0.99, l2: 0.999, l3: 0.9999 },
  },
  'Tier 2': {
    '5s': { l1: 0.99, l2: 0.99, l3: 0.999 },
    '5m': { l1: 0.99, l2: 0.99, l3: 0.999 },
    '15m': { l1: 0.99, l2: 0.999, l3: 0.9999 },
  },
  'Tier 3': {
    '5s': { l1: 0.99, l2: 0.99, l3: 0.99 },
    '5m': { l1: 0.99, l2: 0.99, l3: 0.99 },
    '15m': { l1: 0.99, l2: 0.99, l3: 0.999 },
  },
};

// Parameter adjustment recommendations
export const PARAMETER_RECOMMENDATIONS = {
  'L1': {
    name: 'Level 1 Alert - Elevated Risk',
    actions: [
      { param: 'Price Impact', adjustment: '1.0x → 1.2x', reason: 'Increase price impact to reduce volatility impact' },
      { param: 'Funding Floor APR', adjustment: '+0.5%', reason: 'Increase funding floor to attract hedgers' },
      { param: 'Max Leverage', adjustment: 'No change', reason: 'Monitor closely' },
    ],
  },
  'L2': {
    name: 'Level 2 Alert - High Risk',
    actions: [
      { param: 'Price Impact', adjustment: '1.0x → 1.5x', reason: 'Significantly increase price impact' },
      { param: 'Max Leverage', adjustment: 'Reduce by 20%', reason: 'Reduce leverage to limit exposure' },
      { param: 'Funding Base APR', adjustment: '+1.0%', reason: 'Increase funding rate to attract hedgers' },
      { param: 'Single Pos Cap', adjustment: 'Reduce by 30%', reason: 'Reduce position size limits' },
    ],
  },
  'L3': {
    name: 'Level 3 Alert - Emergency',
    actions: [
      { param: 'Max Leverage', adjustment: 'Reduce to 20x', reason: 'Emergency leverage reduction' },
      { param: 'Price Impact', adjustment: '1.0x → 2.0x', reason: 'Maximum price impact' },
      { param: 'Global Cap', adjustment: 'Reduce by 50%', reason: 'Reduce global exposure' },
      { param: 'Emergency Mode', adjustment: 'Enabled', reason: 'Activate emergency protocols' },
      { param: 'Grace Period', adjustment: 'Extend to 2h', reason: 'Allow time for market stabilization' },
    ],
  },
};

/**
 * Calculate VaR and ES from percentile data
 */
export function calculateVarEs(assetSymbol: string, timeframe: '5s' | '5m' | '15m') {
  const data = PRICE_CHANGE_DATA[assetSymbol];
  if (!data) return null;

  const tf = data.timeframes[timeframe];
  const var99 = tf.p99;
  const var99_9 = tf.p99_9;
  const var99_99 = tf.p99_99;

  // ES as average of percentiles
  const es99 = (tf.p99 + tf.p99_9) / 2;
  const es99_9 = (tf.p99_9 + tf.p99_99) / 2;

  return {
    var99,
    var99_9,
    var99_99,
    es99,
    es99_9,
    esTailRatio: es99 / var99, // ES/VaR ratio indicates fat tail
  };
}

/**
 * Normalize value to 0-10 scale for risk scoring
 */
function normalizeToScore(value: number, min: number, max: number): number {
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return normalized * 10;
}

/**
 * Calculate Risk Score based on multiple factors
 */
export function calculateRiskScore(
  assetSymbol: string,
  currentVolatility: number,
  oiConcentration: number,
  skewAbsolute: number
): { score: number; components: Record<string, number> } {
  const data = PRICE_CHANGE_DATA[assetSymbol];
  if (!data) return { score: 5, components: {} };

  const tier = data.tier as string;
  const weights = TIER_WEIGHTS[tier] as Record<string, number>;

  // Get VaR/ES for 5m timeframe (most relevant for real-time monitoring)
  const varEs = calculateVarEs(assetSymbol, '5m');
  if (!varEs) return { score: 5, components: {} };

  // Calculate component scores (0-10)
  const varScore = normalizeToScore(varEs.var99, 0, 20); // 0-20% range
  const esScore = normalizeToScore(varEs.es99, 0, 25); // 0-25% range
  const rvScore = normalizeToScore(currentVolatility, 0, 15); // 0-15% range
  const kurtosisScore = normalizeToScore(varEs.esTailRatio, 1, 3); // 1-3 ratio range (fat tail indicator)
  const maxLossScore = normalizeToScore(Math.abs(data.timeframes['5m'].p1), 0, 30); // Max loss 0-30%

  // Weighted sum
  const totalScore =
    varScore * weights.var +
    esScore * weights.es +
    rvScore * weights.rv +
    kurtosisScore * weights.kurtosis +
    maxLossScore * weights.maxLoss;

  return {
    score: Math.min(10, totalScore),
    components: {
      var: varScore,
      es: esScore,
      rv: rvScore,
      kurtosis: kurtosisScore,
      maxLoss: maxLossScore,
    },
  };
}

/**
 * Determine alert level based on price movement
 */
export function determineAlertLevel(
  assetSymbol: string,
  priceChange: number,
  timeframe: '5s' | '5m' | '15m'
): { level: 'Normal' | 'L1' | 'L2' | 'L3'; triggered: boolean } {
  const data = PRICE_CHANGE_DATA[assetSymbol];
  if (!data) return { level: 'Normal', triggered: false };

  const tier = data.tier as string;
  const thresholds = ALERT_THRESHOLDS[tier]?.[timeframe] as Record<string, number> || {};
  const tf = data.timeframes[timeframe];

  const absPriceChange = Math.abs(priceChange);

  // Check thresholds from most severe to least
  if (absPriceChange > Math.max(tf.p99_99, Math.abs(tf.p0_001))) {
    return { level: 'L3', triggered: true };
  } else if (absPriceChange > Math.max(tf.p99_9, Math.abs(tf.p0_1))) {
    return { level: 'L2', triggered: true };
  } else if (absPriceChange > Math.max(tf.p99, Math.abs(tf.p1))) {
    return { level: 'L1', triggered: true };
  }

  return { level: 'Normal', triggered: false };
}

/**
 * Get parameter recommendations for alert level
 */
export function getParameterRecommendations(alertLevel: 'L1' | 'L2' | 'L3') {
  return PARAMETER_RECOMMENDATIONS[alertLevel as keyof typeof PARAMETER_RECOMMENDATIONS];
}

/**
 * Calculate recovery timeline for emergency state
 */
export function calculateRecoveryTimeline(alertLevel: 'L1' | 'L2' | 'L3') {
  const timelines = {
    'L1': { duration: '15m', stages: 2 },
    'L2': { duration: '1h', stages: 3 },
    'L3': { duration: '4h', stages: 4 },
  };
  return timelines[alertLevel];
}
