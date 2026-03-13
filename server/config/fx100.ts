export interface LiveMarketConfig {
  symbol: string;
  displayName: string;
  tier: string;
  referencePriceUsd: number;
  marketIndex: number;
  indexToken: string;
  collateralToken: string;
  vault: string;
  minPositionSizeUsd: number;
  maxPositionSizeUsd: number;
  positionFeeFactor: number;
  priceImpactParameter: number;
  askDepthUsd: number;
  bidDepthUsd: number;
  minCollateralFactor: number;
  minCollateralFactorForLiquidation: number;
}

export interface ExternalVenueMarketConfig {
  symbol: string;
  perpSymbol: string;
  spotSymbol: string;
}

export interface LiveEnvironmentConfig {
  name: string;
  network: string;
  rpcUrl: string;
  wssUrl: string;
  externalVenue: {
    name: string;
    restBaseUrl: string;
    markets: ExternalVenueMarketConfig[];
  };
  contracts: {
    DATA_STORE: string;
    EVENT_EMITTER: string;
    ORACLE: string;
    ORDER_HANDLER: string;
    CONFIG: string;
    MARKET_FACTORY: string;
    LP_VAULT_USDC: string;
    MOCK_ORACLE_PROVIDER: string;
  };
  tokens: {
    WETH: string;
    WBTC: string;
    CORE_USDC: string;
  };
  globals: {
    maxOracleRefPriceDeviationFactor: number;
    maxPriceImpactSpread: number;
    skewImpactFactor: number;
    minSkewImpact: number;
    maxSkewImpact: number;
    mockProviderEnabled: boolean;
  };
  markets: LiveMarketConfig[];
}

export const basefx100Sepolia0312: LiveEnvironmentConfig = {
  name: "basefx100Sepolia0312",
  network: "Tenderly Virtual TestNet (Base Sepolia)",
  rpcUrl: "https://virtual.base-sepolia.eu.rpc.tenderly.co/f40c9f2d-814b-4105-8dbb-651e05345f3b",
  wssUrl: "wss://virtual.base-sepolia.eu.rpc.tenderly.co/5fea2708-18f0-44de-9966-f181650e0565",
  externalVenue: {
    name: "Binance Futures",
    restBaseUrl: "https://fapi.binance.com",
    markets: [
      { symbol: "ETH", perpSymbol: "ETHUSDT", spotSymbol: "ETHUSDT" },
      { symbol: "BTC", perpSymbol: "BTCUSDT", spotSymbol: "BTCUSDT" },
    ],
  },
  contracts: {
    DATA_STORE: "0xEd54a245b22d4F7Ac15E8Cf584BD82Cc1b1CbaB1",
    EVENT_EMITTER: "0x0DD5521fD9d5442F058D7f1e0B230C479322db59",
    ORACLE: "0x33930c2f55591c0BbB40b0d43f71798B4333985c",
    ORDER_HANDLER: "0x529558d04552679D4Fe277DCE994F2e0e4f8bc78",
    CONFIG: "0xe14063F4d1e6B833cc2E65a32519cb96e2Be985a",
    MARKET_FACTORY: "0x47508E41079d230699F6f394B6f8ACEECa4Fce6E",
    LP_VAULT_USDC: "0x2a8d057b50774e97Afd35E6c00767c41334cC536",
    MOCK_ORACLE_PROVIDER: "0xFD7a2f3c76EB667A454658DB4CF089afc114f0d4",
  },
  tokens: {
    WETH: "0x4200000000000000000000000000000000000006",
    WBTC: "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39",
    CORE_USDC: "0x460faF939c098112B2C0711706F8c076615f4997",
  },
  globals: {
    maxOracleRefPriceDeviationFactor: 0.02,
    maxPriceImpactSpread: 0.005,
    skewImpactFactor: 0.0025,
    minSkewImpact: 0,
    maxSkewImpact: 0.005,
    mockProviderEnabled: false,
  },
  markets: [
    {
      symbol: "ETH",
      displayName: "ETH-USD",
      tier: "Tier 1",
      referencePriceUsd: 4425,
      marketIndex: 1,
      indexToken: "0x4200000000000000000000000000000000000006",
      collateralToken: "0x460faF939c098112B2C0711706F8c076615f4997",
      vault: "0x2a8d057b50774e97Afd35E6c00767c41334cC536",
      minPositionSizeUsd: 10,
      maxPositionSizeUsd: 6_000_000,
      positionFeeFactor: 0.0002,
      priceImpactParameter: 0.6,
      askDepthUsd: 7_923_961.27,
      bidDepthUsd: 7_767_179.17,
      minCollateralFactor: 0.01,
      minCollateralFactorForLiquidation: 0.005,
    },
    {
      symbol: "BTC",
      displayName: "WBTC-USD",
      tier: "Tier 1",
      referencePriceUsd: 84210,
      marketIndex: 2,
      indexToken: "0xD8a6E3FCA403d79b6AD6216b60527F51cc967D39",
      collateralToken: "0x460faF939c098112B2C0711706F8c076615f4997",
      vault: "0x2a8d057b50774e97Afd35E6c00767c41334cC536",
      minPositionSizeUsd: 10,
      maxPositionSizeUsd: 8_000_000,
      positionFeeFactor: 0.0002,
      priceImpactParameter: 0.5,
      askDepthUsd: 15_593_281.79,
      bidDepthUsd: 15_217_320.43,
      minCollateralFactor: 0.01,
      minCollateralFactorForLiquidation: 0.004,
    },
  ],
};
