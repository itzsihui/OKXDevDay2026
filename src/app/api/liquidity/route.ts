import { ensureUsdt0Liquidity } from "@/lib/liquidity/route";

export const runtime = "nodejs";

/**
 * Preview or execute X Layer liquidity routing (native → USDT0) before x402.
 * GET/POST ?price=0.01&execute=0|1
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const price = url.searchParams.get("price") || "0.01";
  const quantity = Number(url.searchParams.get("quantity") || "1");
  const execute = url.searchParams.get("execute") === "1";
  try {
    const result = await ensureUsdt0Liquidity({ price, quantity, execute });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "liquidity route failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      price?: string;
      quantity?: number;
      execute?: boolean;
    };
    const result = await ensureUsdt0Liquidity({
      price: body.price || "0.01",
      quantity: body.quantity,
      execute: Boolean(body.execute),
    });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "liquidity route failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
