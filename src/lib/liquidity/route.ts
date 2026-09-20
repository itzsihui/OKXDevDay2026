import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseEther,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config, explorerTx, toAtomic } from "@/lib/config";
import { hasOkxDexCredentials, okxAuthHeaders } from "@/lib/okx/auth";

/** OKX DEX native-token sentinel (EVM). */
export const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const ERC20_BALANCE_OF = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type WalletBalances = {
  address: string;
  usdt0Atomic: string;
  usdt0Human: string;
  nativeWei: string;
  nativeHuman: string;
  hasEnoughUsdt0: boolean;
  shortfallAtomic: string;
};

export type LiquidityQuote = {
  mode: "live" | "plan";
  chainIndex: string;
  fromSymbol: string;
  toSymbol: string;
  fromAmountHuman: string;
  toAmountHuman: string;
  fromTokenAddress: string;
  toTokenAddress: string;
  routeSummary: string;
  priceImpact?: string;
  raw?: unknown;
};

export type LiquidityRouteResult = {
  needed: boolean;
  balances: WalletBalances | null;
  quote: LiquidityQuote | null;
  swapTxHash?: string;
  explorerUrl?: string;
  executed: boolean;
  message: string;
};

function chainIndexForDex() {
  // OKX DEX aggregator lists X Layer mainnet as 196; testnet quotes may fail.
  // Prefer configured chain; fall back to 196 for quote attempts on mainnet liquidity.
  return String(config.chainId);
}

function publicClient() {
  return createPublicClient({
    transport: http(config.rpcUrl),
  });
}

export async function readBuyerBalances(
  neededAtomic: string,
  address?: `0x${string}`,
): Promise<WalletBalances | null> {
  const buyerKey = config.buyerPrivateKey;
  if (!buyerKey && !address) return null;
  const account = address
    ? { address }
    : privateKeyToAccount(buyerKey!);
  const client = publicClient();
  const [nativeWei, tokenBal] = await Promise.all([
    client.getBalance({ address: account.address }),
    client.readContract({
      address: config.tokenAddress as `0x${string}`,
      abi: ERC20_BALANCE_OF,
      functionName: "balanceOf",
      args: [account.address],
    }),
  ]);
  const usdt0Atomic = tokenBal.toString();
  const need = BigInt(neededAtomic);
  const have = BigInt(usdt0Atomic);
  const shortfall = need > have ? need - have : 0n;
  return {
    address: account.address,
    usdt0Atomic,
    usdt0Human: formatUnits(tokenBal, config.tokenDecimals),
    nativeWei: nativeWei.toString(),
    nativeHuman: formatEther(nativeWei),
    hasEnoughUsdt0: have >= need,
    shortfallAtomic: shortfall.toString(),
  };
}

type OkxQuoteRow = {
  fromToken?: { tokenSymbol?: string; decimal?: string };
  toToken?: { tokenSymbol?: string; decimal?: string };
  fromTokenAmount?: string;
  toTokenAmount?: string;
  priceImpactPercentage?: string;
  dexRouterList?: Array<{
    dexProtocol?: { dexName?: string };
    router?: string;
  }>;
};

async function okxGetJson<T>(pathWithQuery: string): Promise<T> {
  const url = `${config.okxBaseUrl}${pathWithQuery}`;
  const headers = okxAuthHeaders("GET", pathWithQuery);
  const res = await fetch(url, { headers, cache: "no-store" });
  const json = (await res.json()) as T & { code?: string; msg?: string };
  return json;
}

function planQuote(balances: WalletBalances, neededAtomic: string): LiquidityQuote {
  const shortfallHuman = formatUnits(
    BigInt(balances.shortfallAtomic || neededAtomic),
    config.tokenDecimals,
  );
  // Rough demo sizing: use a small slice of native for the plan display.
  const nativePlan =
    Number(balances.nativeHuman) > 0.002
      ? "0.002"
      : balances.nativeHuman || "0";
  return {
    mode: "plan",
    chainIndex: chainIndexForDex(),
    fromSymbol: "OKB",
    toSymbol: config.tokenSymbol,
    fromAmountHuman: nativePlan,
    toAmountHuman: shortfallHuman,
    fromTokenAddress: NATIVE_TOKEN,
    toTokenAddress: config.tokenAddress,
    routeSummary: `Plan: OKB → ${config.tokenSymbol} on X Layer (${config.network}) via OKX DEX aggregator`,
  };
}

export async function quoteNativeToUsdt0(
  balances: WalletBalances,
  neededAtomic: string,
): Promise<LiquidityQuote> {
  const fallback = planQuote(balances, neededAtomic);
  if (!hasOkxDexCredentials()) return fallback;

  // Estimate native in: prefer small demo amount; scale if balance allows.
  const nativeIn =
    BigInt(balances.nativeWei) > parseEther("0.01")
      ? parseEther("0.01")
      : BigInt(balances.nativeWei) / 2n;
  if (nativeIn <= 0n) return fallback;

  const chainIndex = chainIndexForDex();
  const qs = new URLSearchParams({
    chainIndex,
    amount: nativeIn.toString(),
    fromTokenAddress: NATIVE_TOKEN,
    toTokenAddress: config.tokenAddress,
    swapMode: "exactIn",
  });
  const path = `/api/v6/dex/aggregator/quote?${qs.toString()}`;

  try {
    const raw = await okxGetJson<{
      code?: string;
      msg?: string;
      data?: OkxQuoteRow[];
    }>(path);
    const row = raw.data?.[0];
    if (raw.code !== "0" || !row?.toTokenAmount) {
      return { ...fallback, raw };
    }
    const fromDec = Number(row.fromToken?.decimal ?? 18);
    const toDec = Number(row.toToken?.decimal ?? config.tokenDecimals);
    const dexName =
      row.dexRouterList?.[0]?.dexProtocol?.dexName || "OKX DEX";
    return {
      mode: "live",
      chainIndex,
      fromSymbol: row.fromToken?.tokenSymbol || "OKB",
      toSymbol: row.toToken?.tokenSymbol || config.tokenSymbol,
      fromAmountHuman: formatUnits(BigInt(row.fromTokenAmount || nativeIn), fromDec),
      toAmountHuman: formatUnits(BigInt(row.toTokenAmount), toDec),
      fromTokenAddress: NATIVE_TOKEN,
      toTokenAddress: config.tokenAddress,
      routeSummary: `${row.fromToken?.tokenSymbol || "OKB"} → ${row.toToken?.tokenSymbol || config.tokenSymbol} via ${dexName}`,
      priceImpact: row.priceImpactPercentage,
      raw,
    };
  } catch {
    return fallback;
  }
}

type OkxSwapData = {
  routerResult?: OkxQuoteRow;
  tx?: {
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
    maxPriorityFeePerGas?: string;
    maxFeePerGas?: string;
  };
};

export async function executeNativeToUsdt0Swap(
  quote: LiquidityQuote,
  walletAddress: `0x${string}`,
): Promise<{ txHash?: string; error?: string; raw?: unknown }> {
  const buyerKey = config.buyerPrivateKey;
  if (!buyerKey) {
    return { error: "BUYER_PRIVATE_KEY missing — cannot execute swap" };
  }
  if (!hasOkxDexCredentials()) {
    return { error: "OKX credentials missing — cannot execute swap" };
  }
  if (quote.mode !== "live") {
    return { error: "Live DEX quote unavailable — fund USDT0 or retry on mainnet liquidity" };
  }

  const fromAmountAtomic = (() => {
    try {
      return parseEther(quote.fromAmountHuman).toString();
    } catch {
      return "";
    }
  })();
  if (!fromAmountAtomic) {
    return { error: "Invalid from amount on quote" };
  }

  const qs = new URLSearchParams({
    chainIndex: quote.chainIndex,
    amount: fromAmountAtomic,
    fromTokenAddress: quote.fromTokenAddress,
    toTokenAddress: quote.toTokenAddress,
    slippagePercent: "0.5",
    userWalletAddress: walletAddress,
    swapMode: "exactIn",
  });
  const path = `/api/v6/dex/aggregator/swap?${qs.toString()}`;

  try {
    const raw = await okxGetJson<{
      code?: string;
      msg?: string;
      data?: OkxSwapData[];
    }>(path);
    const tx = raw.data?.[0]?.tx;
    if (raw.code !== "0" || !tx?.to || !tx.data) {
      return {
        error: raw.msg || "OKX swap calldata unavailable",
        raw,
      };
    }

    const account = privateKeyToAccount(buyerKey);
    const wallet = createWalletClient({
      account,
      transport: http(config.rpcUrl),
    });
    const hash = await wallet.sendTransaction({
      to: tx.to as `0x${string}`,
      data: tx.data as Hex,
      value: tx.value ? BigInt(tx.value) : 0n,
      chain: undefined,
      ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
      ...(tx.gasPrice ? { gasPrice: BigInt(tx.gasPrice) } : {}),
    });
    return { txHash: hash, raw };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "swap broadcast failed",
    };
  }
}

/**
 * Ensure the buyer wallet can cover `price` USDT0 on X Layer.
 * Fail-soft: returns a plan quote when DEX liquidity / keys are missing;
 * only blocks settle when USDT0 is short and no swap could run.
 */
export async function ensureUsdt0Liquidity(args: {
  price: string;
  quantity?: number;
  /** When true, attempt broadcast if live quote exists. */
  execute?: boolean;
}): Promise<LiquidityRouteResult> {
  const quantity = Math.max(1, args.quantity ?? 1);
  let neededAtomic: string;
  try {
    neededAtomic = (
      BigInt(toAtomic(args.price)) * BigInt(quantity)
    ).toString();
  } catch {
    return {
      needed: false,
      balances: null,
      quote: null,
      executed: false,
      message: `Invalid price: ${args.price}`,
    };
  }

  const balances = await readBuyerBalances(neededAtomic);
  if (!balances) {
    return {
      needed: true,
      balances: null,
      quote: null,
      executed: false,
      message:
        "No buyer wallet — set BUYER_PRIVATE_KEY to route liquidity on X Layer",
    };
  }

  if (balances.hasEnoughUsdt0) {
    return {
      needed: false,
      balances,
      quote: null,
      executed: false,
      message: `USDT0 balance ${balances.usdt0Human} covers purchase`,
    };
  }

  const quote = await quoteNativeToUsdt0(balances, neededAtomic);
  if (!args.execute) {
    return {
      needed: true,
      balances,
      quote,
      executed: false,
      message: `Need ${formatUnits(BigInt(balances.shortfallAtomic), config.tokenDecimals)} more ${config.tokenSymbol}. ${quote.routeSummary}`,
    };
  }

  const exec = await executeNativeToUsdt0Swap(
    quote,
    balances.address as `0x${string}`,
  );
  if (exec.txHash) {
    return {
      needed: true,
      balances,
      quote,
      swapTxHash: exec.txHash,
      explorerUrl: explorerTx(exec.txHash),
      executed: true,
      message: `Routed liquidity: ${quote.routeSummary}`,
    };
  }

  // Fail-soft for demo: surface plan; caller may still settle if USDT0 was topped up.
  return {
    needed: true,
    balances,
    quote,
    executed: false,
    message:
      exec.error ||
      `Could not auto-swap — fund ${config.tokenSymbol} or retry. ${quote.routeSummary}`,
  };
}
