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
  operators: {
    deployer: string;
    orderKeeper: string;
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
    verifiedLiveOiPath?: boolean;
  };
  distributionAddressProbes: Array<{ name: string; label: string; perChain?: boolean }>;
  markets: LiveMarketConfig[];
}

export const basefx100Sepolia0312: LiveEnvironmentConfig = {
  name: "fx100Base49b34c09",
  network: "Tenderly Virtual TestNet (Base fork)",
  rpcUrl: "https://virtual.base.eu.rpc.tenderly.co/49b34c09-5fb0-4814-9440-4231f0018ac5",
  wssUrl: "",
  externalVenue: {
    name: "Binance Futures",
    restBaseUrl: "https://fapi.binance.com",
    markets: [
      { symbol: "ETH", perpSymbol: "ETHUSDT", spotSymbol: "ETHUSDT" },
      { symbol: "BTC", perpSymbol: "BTCUSDT", spotSymbol: "BTCUSDT" },
    ],
  },
  contracts: {
    DATA_STORE: "0x553Ab8A1997988562E4E6e72967FB59605128940",
    EVENT_EMITTER: "0x76b896AEfC1502ce08497198106d3929438Dc0E4",
    ORACLE: "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
    ORDER_HANDLER: "0x1Caf6d94Ed52f3EFf497Aa9DDF4abf4756ef02B9",
    CONFIG: "0x9b9Ffe0E87f1f90A78790A0589CF5EBb3C101E9E",
    MARKET_FACTORY: "0xC3e142E47cFDecC442D1D526ECC000A60F1c4721",
    LP_VAULT_USDC: "0x9a9e5cE336abFcF1fBc61A98C1D7246446e9f924",
    MOCK_ORACLE_PROVIDER: "0x08B98cD8b1aeaA5763520399f6C7852f28C0d1Fc",
  },
  operators: {
    deployer: "0xb5eb16b6dF444c07309fd5f5635BA21Ef30F8cA2",
    orderKeeper: "0x0df15a5110ef7aA966F3bB9bA10d61d8ff337048",
  },
  tokens: {
    WETH: "0x4200000000000000000000000000000000000006",
    WBTC: "0xA852Af33A6Dd6dF18714A3Cdad6c8928560Dfa31",
    CORE_USDC: "0xbE0772586DCf3AD9121F638908c34948B0Bd2A3f",
  },
  globals: {
    maxOracleRefPriceDeviationFactor: 0.02,
    maxPriceImpactSpread: 0.005,
    skewImpactFactor: 0.0025,
    minSkewImpact: 0,
    maxSkewImpact: 0.005,
    mockProviderEnabled: true,
    verifiedLiveOiPath: true,
  },
  distributionAddressProbes: [
    { name: "FEE_DISTRIBUTOR_VAULT", label: "Fee Distributor Vault" },
    { name: "KEEPER_READER", label: "Keeper Reader" },
    { name: "DEPLOYER", label: "Deployer" },
    { name: "ORDER_KEEPER", label: "Order Keeper" },
    { name: "MOCK_ORACLE_PROVIDER", label: "Mock Oracle Provider" },
    { name: "FEE_DISTRIBUTOR_VAULT", label: "Fee Distributor Vault (Current Chain)", perChain: true },
    { name: "KEEPER_READER", label: "Keeper Reader (Current Chain)", perChain: true },
    { name: "ORDER_KEEPER", label: "Order Keeper (Current Chain)", perChain: true },
  ],
  markets: [
    {
      symbol: "ETH",
      displayName: "ETH-USD",
      tier: "Tier 1",
      referencePriceUsd: 2200,
      marketIndex: 1,
      indexToken: "0x4200000000000000000000000000000000000006",
      collateralToken: "0xbE0772586DCf3AD9121F638908c34948B0Bd2A3f",
      vault: "0x9a9e5cE336abFcF1fBc61A98C1D7246446e9f924",
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
      referencePriceUsd: 72000,
      marketIndex: 2,
      indexToken: "0xA852Af33A6Dd6dF18714A3Cdad6c8928560Dfa31",
      collateralToken: "0xbE0772586DCf3AD9121F638908c34948B0Bd2A3f",
      vault: "0x9a9e5cE336abFcF1fBc61A98C1D7246446e9f924",
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
