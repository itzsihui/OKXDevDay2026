import {
  createPublicClient,
  createWalletClient,
  http,
  parseSignature,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { PaymentPayload } from "@okxweb3/x402-core/types";
import { config } from "@/lib/config";

const EIP3009_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

type Eip3009Authorization = {
  from: Hex;
  to: Hex;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
};

function readAuthorization(
  payload: PaymentPayload,
): { authorization: Eip3009Authorization; signature: Hex } | null {
  const inner = payload.payload as {
    signature?: Hex;
    authorization?: Eip3009Authorization;
  };
  if (!inner?.signature || !inner.authorization?.nonce) return null;
  return { authorization: inner.authorization, signature: inner.signature };
}

export function hasRelayer() {
  return Boolean(config.relayerPrivateKey);
}

/**
 * Submit the buyer's signed EIP-3009 authorization ourselves when the
 * facilitator does not land it. The relayer only pays gas; funds move
 * buyer → payTo exactly as signed.
 */
export async function selfSettleEip3009(args: {
  payload: PaymentPayload;
  asset: string;
  payTo: string;
  amount: string;
}): Promise<{ ok: true; txHash: string } | { ok: false; reason: string }> {
  const key = config.relayerPrivateKey;
  if (!key) {
    return { ok: false, reason: "RELAYER_PRIVATE_KEY not set" };
  }
  const parsed = readAuthorization(args.payload);
  if (!parsed) {
    return { ok: false, reason: "Payload is not an EIP-3009 authorization" };
  }
  const { authorization: a, signature } = parsed;
  if (
    a.to.toLowerCase() !== args.payTo.toLowerCase() ||
    a.value !== args.amount
  ) {
    return { ok: false, reason: "Authorization does not match requirements" };
  }

  const account = privateKeyToAccount(key);
  const transport = http(config.rpcUrl);
  const rpc = createPublicClient({ transport });
  const wallet = createWalletClient({ account, transport });
  const asset = args.asset as Hex;
  const base = [
    a.from,
    a.to,
    BigInt(a.value),
    BigInt(a.validAfter),
    BigInt(a.validBefore),
    a.nonce,
  ] as const;

  const { v, r, s, yParity } = parseSignature(signature);
  const candidates = [
    { args: [...base, signature] as const },
    { args: [...base, Number(v ?? BigInt(yParity + 27)), r, s] as const },
  ];

  let lastError = "simulation failed";
  for (const c of candidates) {
    try {
      const { request } = await rpc.simulateContract({
        account,
        address: asset,
        abi: EIP3009_ABI,
        functionName: "transferWithAuthorization",
        args: c.args,
      });
      const hash = await wallet.writeContract({ ...request, chain: null });
      const receipt = await rpc.waitForTransactionReceipt({
        hash,
        timeout: 30_000,
      });
      return receipt.status === "success"
        ? { ok: true, txHash: hash }
        : { ok: false, reason: `Self-settle tx ${hash} reverted` };
    } catch (error) {
      lastError =
        (error as { shortMessage?: string }).shortMessage ||
        (error instanceof Error ? error.message : lastError);
    }
  }
  return { ok: false, reason: `Self-settle failed: ${lastError}` };
}
