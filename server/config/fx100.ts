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
    READER: string;
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
  name: "fx100Base7",
  network: "Tenderly Virtual TestNet (Base fork)",
  rpcUrl: "https://virtual.base.eu.rpc.tenderly.co/b0878d34-d8ee-4056-a841-bfe8b9585e4e",
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
    DATA_STORE: "0xE825D76E50254906499F257b80f92DF75Cd85a6C",
    EVENT_EMITTER: "0x59f6f1Aa4A088bEFD83b425fBDbc5180AB54B627",
    ORACLE: "0x50769e53c4F265c17e7Dc41ac72f0861095D6Fb2",
    READER: "0xa3019A24EEeC55cBFd21056b7351e9365f15F9b6",
    ORDER_HANDLER: "0x08B98cD8b1aeaA5763520399f6C7852f28C0d1Fc",
    CONFIG: "0x9a9e5cE336abFcF1fBc61A98C1D7246446e9f924",
    MARKET_FACTORY: "0x4aBEE607da8c3f0D460FaFe33A8Ecb4BFE62d48A",
    LP_VAULT_USDC: "0xedB74C75f1450C747b648291df0Bc7a68D26b118",
    MOCK_ORACLE_PROVIDER: "0x26c1F78e4fDb3CC66B5FC89DF82BC49f9a7dBc5d",
  },
  operators: {
    deployer: "0xb5eb16b6dF444c07309fd5f5635BA21Ef30F8cA2",
    orderKeeper: "0x0df15a5110ef7aA966F3bB9bA10d61d8ff337048",
  },
  tokens: {
    WETH: "0x4200000000000000000000000000000000000006",
    WBTC: "0x9b9Ffe0E87f1f90A78790A0589CF5EBb3C101E9E",
    CORE_USDC: "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
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
      collateralToken: "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
      vault: "0xedB74C75f1450C747b648291df0Bc7a68D26b118",
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
      indexToken: "0x9b9Ffe0E87f1f90A78790A0589CF5EBb3C101E9E",
      collateralToken: "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
      vault: "0xedB74C75f1450C747b648291df0Bc7a68D26b118",
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
