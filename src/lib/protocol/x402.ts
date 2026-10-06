import {
  OKXFacilitatorClient,
} from "@okxweb3/x402-core";
import {
  encodePaymentRequiredHeader,
  decodePaymentSignatureHeader,
} from "@okxweb3/x402-core/http";
import { createPublicClient, http } from "viem";
import type {
  PaymentPayload,
  PaymentRequired,
  PaymentRequirements,
} from "@okxweb3/x402-core/types";
import {
  config,
  explorerTx,
  toAtomic,
} from "@/lib/config";
import type { Sku, StoreRecord } from "@/lib/store/types";
import { hasRelayer, selfSettleEip3009 } from "@/lib/protocol/self-settle";

export type { PaymentRequired, PaymentRequirements, PaymentPayload };

export function buildPaymentRequired(
  store: StoreRecord,
  sku: Sku,
  origin: string,
  orderId: string,
  quantity: number,
): PaymentRequired {
  const amount = (
    BigInt(toAtomic(sku.price)) * BigInt(quantity)
  ).toString();
  const asset = (sku.settleAsset || config.tokenAddress).trim();
  const symbol = (sku.settleSymbol || config.tokenSymbol).trim();
  const accept: PaymentRequirements = {
    scheme: "exact",
    network: config.network,
    amount,
    asset,
    payTo: store.merchantAddress,
    maxTimeoutSeconds: 300,
    extra: {
      name: symbol === "USDT0" ? "USD₮0" : symbol,
      version: "1",
      orderId,
      quoteCurrency: sku.quoteCurrency || symbol,
      quotePrice: sku.quotePrice || sku.price,
    },
  };
  return {
    x402Version: 2,
    resource: {
      url: `${origin}/s/${store.slug}/buy`,
      description: `${sku.title} x${quantity}`,
      mimeType: "application/json",
    },
    accepts: [accept],
  };
}

/** Atomic amount for order records (micro-units). */
export function paymentAmountAtomic(
  store: StoreRecord,
  sku: Sku,
  quantity: number,
): string {
  return (
    BigInt(toAtomic(sku.price)) * BigInt(quantity)
  ).toString();
}

export function parsePaymentSignature(header: string): PaymentPayload | null {
  const raw = header.trim();
  if (!raw) return null;
  try {
    return decodePaymentSignatureHeader(raw);
  } catch {
    try {
      const decoded = JSON.parse(
        Buffer.from(raw, "base64").toString("utf8"),
      ) as PaymentPayload;
      if (decoded?.x402Version && decoded?.payload && decoded?.accepted) {
        return decoded;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function hasOkxCredentials() {
  return Boolean(
    config.okxApiKey && config.okxSecretKey && config.okxPassphrase,
  );
}

function facilitator() {
  if (!hasOkxCredentials()) {
    throw new Error(
      "OKX facilitator credentials missing. Set OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE.",
    );
  }
  return new OKXFacilitatorClient({
    apiKey: config.okxApiKey,
    secretKey: config.okxSecretKey,
    passphrase: config.okxPassphrase,
    baseUrl: config.okxBaseUrl,
    syncSettle: true,
  });
}

/**
 * A facilitator tx hash is not proof of payment: the transfer can still revert
 * (e.g. insufficient balance). Require a successful on-chain receipt.
 */
async function confirmSettlement(
  client: OKXFacilitatorClient,
  txHash: string,
  waitMs: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const rpc = createPublicClient({ transport: http(config.rpcUrl) });
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const receipt = await rpc.getTransactionReceipt({
        hash: txHash as `0x${string}`,
      });
      return receipt.status === "success"
        ? { ok: true }
        : { ok: false, reason: `Settlement tx ${txHash} reverted on-chain` };
    } catch {
      // Not mined yet; fall through to facilitator status.
    }
    try {
      const status = await client.getSettleStatus(txHash);
      if (status.status === "failed" || (!status.success && status.errorReason)) {
        return {
          ok: false,
          reason:
            status.errorReason ||
            status.errorMessage ||
            `Settlement tx ${txHash} failed`,
        };
      }
    } catch {
      // Status endpoint is best-effort.
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return {
    ok: false,
    reason: `Settlement tx ${txHash} not confirmed on-chain in time`,
  };
}

async function chainStalledReason(): Promise<string | null> {
  try {
    const rpc = createPublicClient({ transport: http(config.rpcUrl) });
    const block = await rpc.getBlock();
    const ageSec = Math.floor(Date.now() / 1000) - Number(block.timestamp);
    if (ageSec < 120) return null;
    return `X Layer (${config.network}) is not producing blocks: latest block ${block.number} is ${Math.round(ageSec / 60)} min old. No payment was taken; retry when the chain resumes.`;
  } catch {
    return null;
  }
}

/**
 * Verify + settle a signed EVM payment via the OKX facilitator.
 */
export async function verifyAndSettle(args: {
  paymentHeader: string;
  paymentRequirements: PaymentRequirements;
  paymentPayload?: PaymentPayload | null;
}) {
  try {
    const payload =
      args.paymentPayload || parsePaymentSignature(args.paymentHeader);
    if (!payload) {
      return { ok: false as const, reason: "Invalid PAYMENT-SIGNATURE" };
    }

    const client = facilitator();
    const verified = await client.verify(payload, args.paymentRequirements);
    if (!verified.isValid) {
      return {
        ok: false as const,
        reason:
          verified.invalidReason ||
          verified.invalidMessage ||
          "Facilitator rejected payment",
      };
    }

    const relayer = hasRelayer();
    const settled = await client
      .settle(payload, args.paymentRequirements)
      .catch((error: unknown) => ({
        success: false,
        transaction: "",
        payer: undefined,
        errorReason: error instanceof Error ? error.message : "settle threw",
        errorMessage: undefined,
      }));

    let facilitatorReason =
      settled.errorReason || settled.errorMessage || "Facilitator settle failed";
    if (settled.success && settled.transaction) {
      const confirmed = await confirmSettlement(
        client,
        settled.transaction,
        relayer ? 8_000 : 25_000,
      );
      if (confirmed.ok) {
        return {
          ok: true as const,
          txHash: settled.transaction,
          explorerUrl: explorerTx(settled.transaction),
          payer: settled.payer || undefined,
          settledBy: "okx-facilitator" as const,
        };
      }
      facilitatorReason = confirmed.reason;
    }

    const stalled = await chainStalledReason();
    if (stalled) return { ok: false as const, reason: stalled };

    if (!relayer) {
      return { ok: false as const, reason: facilitatorReason };
    }

    const self = await selfSettleEip3009({
      payload,
      asset: args.paymentRequirements.asset,
      payTo: args.paymentRequirements.payTo,
      amount: args.paymentRequirements.amount,
    });
    if (!self.ok) {
      return {
        ok: false as const,
        reason: `${facilitatorReason}. ${self.reason}`,
      };
    }
    return {
      ok: true as const,
      txHash: self.txHash,
      explorerUrl: explorerTx(self.txHash),
      payer: verified.payer || undefined,
      settledBy: "relayer" as const,
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "verifyAndSettle failed";
    return { ok: false as const, reason };
  }
}

/** @deprecated Use verifyAndSettle — kept name alias for call-site clarity. */
export async function verifyTransfer(args: {
  paymentHeader: string;
  paymentRequirements: PaymentRequirements;
}) {
  return verifyAndSettle(args);
}

export function paymentRequiredHeaders(body: PaymentRequired) {
  return {
    "content-type": "application/json",
    "PAYMENT-REQUIRED": encodePaymentRequiredHeader(body),
    "cache-control": "no-store",
  };
}
