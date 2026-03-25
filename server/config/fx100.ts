import fs from "fs";
import path from "path";

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

const MONITOR_REPO_ROOT = process.cwd();
const CONTRACTS_REPO_ROOT = path.resolve(MONITOR_REPO_ROOT, "../fx100-contracts_fork");
const MONITOR_ENV_LOCAL_PATH = path.join(MONITOR_REPO_ROOT, ".env.local");
const TRADING_ENV_LOCAL_PATH = path.join(CONTRACTS_REPO_ROOT, "docs", "test-website", ".env.local");
const LOCAL_PROFILE = "scripts/local/envs/fx100Local.env";
const LOCAL_PROFILE_PATH = path.join(CONTRACTS_REPO_ROOT, LOCAL_PROFILE);
const DEFAULT_PROFILE = fs.existsSync(LOCAL_PROFILE_PATH)
  ? LOCAL_PROFILE
  : "scripts/deploy/base-fork/envs/fx100Base8.env";

function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const out: Record<string, string> = {};
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    out[key] = value;
  }
  return out;
}

function resolveProfilePath(): string {
  const monitorEnvLocal = readEnvFile(MONITOR_ENV_LOCAL_PATH);
  const tradingEnvLocal = readEnvFile(TRADING_ENV_LOCAL_PATH);
  const configured =
    process.env.FX100_MONITOR_FORK_PROFILE ||
    monitorEnvLocal.FX100_MONITOR_FORK_PROFILE ||
    tradingEnvLocal.FX100_TRADING_FORK_PROFILE ||
    DEFAULT_PROFILE;

  return path.isAbsolute(configured) ? configured : path.join(CONTRACTS_REPO_ROOT, configured);
}

function buildEnvironmentConfig(): LiveEnvironmentConfig {
  const profilePath = resolveProfilePath();
  const env = readEnvFile(profilePath);
  const rpcUrl = env.BASE_SEPOLIA_FORK_RPC || "https://virtual.base.eu.rpc.tenderly.co/26c871a6-a4c4-45fa-9b65-71e5bc62c7ef";
  const name = env.FX100_ENV_NAME || env.NAME || path.basename(profilePath, path.extname(profilePath));
  const network = rpcUrl.includes("127.0.0.1") || rpcUrl.includes("localhost")
    ? "Local Anvil (Base fork)"
    : "Tenderly Virtual TestNet (Base fork)";

  return {
    name,
    network,
    rpcUrl,
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
      DATA_STORE: env.DATA_STORE || "0xE825D76E50254906499F257b80f92DF75Cd85a6C",
      EVENT_EMITTER: env.EVENT_EMITTER || "0x59f6f1Aa4A088bEFD83b425fBDbc5180AB54B627",
      ORACLE: env.ORACLE || "0x50769e53c4F265c17e7Dc41ac72f0861095D6Fb2",
      READER: env.READER || "0xa3019A24EEeC55cBFd21056b7351e9365f15F9b6",
      ORDER_HANDLER: env.ORDER_HANDLER || "0x08B98cD8b1aeaA5763520399f6C7852f28C0d1Fc",
      CONFIG: env.CONFIG || "0x9a9e5cE336abFcF1fBc61A98C1D7246446e9f924",
      MARKET_FACTORY: env.MARKET_FACTORY || "0x4aBEE607da8c3f0D460FaFe33A8Ecb4BFE62d48A",
      LP_VAULT_USDC: env.LP_VAULT_USDC || "0xedB74C75f1450C747b648291df0Bc7a68D26b118",
      MOCK_ORACLE_PROVIDER: env.MOCK_ORACLE_PROVIDER || "0x26c1F78e4fDb3CC66B5FC89DF82BC49f9a7dBc5d",
    },
    operators: {
      deployer: env.ADMIN_ADDR || env.TEST_EOA || "0xb5eb16b6dF444c07309fd5f5635BA21Ef30F8cA2",
      orderKeeper: env.ORDER_KEEPER || "0x0df15a5110ef7aA966F3bB9bA10d61d8ff337048",
    },
    tokens: {
      WETH: env.WETH_ADDRESS || "0x4200000000000000000000000000000000000006",
      WBTC: env.WBTC_ADDRESS || "0x9b9Ffe0E87f1f90A78790A0589CF5EBb3C101E9E",
      CORE_USDC: env.CORE_USDC || "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
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
        indexToken: env.WETH_ADDRESS || "0x4200000000000000000000000000000000000006",
        collateralToken: env.CORE_USDC || "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
        vault: env.LP_VAULT_USDC || "0xedB74C75f1450C747b648291df0Bc7a68D26b118",
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
        indexToken: env.WBTC_ADDRESS || "0x9b9Ffe0E87f1f90A78790A0589CF5EBb3C101E9E",
        collateralToken: env.CORE_USDC || "0x556e8470aA40bBF78fB7F67Bcae6A3046c84106d",
        vault: env.LP_VAULT_USDC || "0xedB74C75f1450C747b648291df0Bc7a68D26b118",
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
}

export const basefx100Sepolia0312: LiveEnvironmentConfig = buildEnvironmentConfig();
