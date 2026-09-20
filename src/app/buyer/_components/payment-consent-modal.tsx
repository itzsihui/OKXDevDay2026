"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { MarketProductPick, PaymentRail } from "../_lib/buyer-flow";

type RoutePreview = {
  needed?: boolean;
  message?: string;
  quote?: {
    mode?: string;
    fromSymbol?: string;
    toSymbol?: string;
    fromAmountHuman?: string;
    toAmountHuman?: string;
    routeSummary?: string;
  };
  balances?: {
    usdt0Human?: string;
    nativeHuman?: string;
    hasEnoughUsdt0?: boolean;
  };
};

export function PaymentConsentModal({
  open,
  product,
  rail,
  onCancel,
  onAuthorize,
  busy,
}: {
  open: boolean;
  product: MarketProductPick | null;
  rail: PaymentRail | null;
  onCancel: () => void;
  onAuthorize: () => void;
  busy?: boolean;
}) {
  const [route, setRoute] = useState<RoutePreview | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  useEffect(() => {
    if (!open || !product || rail !== "stablecoin") {
      setRoute(null);
      return;
    }
    let cancelled = false;
    void fetch(
      `/api/liquidity?price=${encodeURIComponent(product.price)}&execute=0`,
    )
      .then((r) => r.json())
      .then((data: RoutePreview) => {
        if (!cancelled) setRoute(data);
      })
      .catch(() => {
        if (!cancelled) setRoute(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, product, rail]);

  if (!open || !product || !rail) return null;

  const isVisa = rail === "visa";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <button
        type="button"
        aria-label="Close consent dialog"
        className="absolute inset-0 bg-black/50"
        disabled={busy}
        onClick={() => {
          if (!busy) onCancel();
        }}
      />
      <div className="relative z-[1] w-full max-w-md border border-border bg-background shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h2
            id="consent-title"
            className="font-[family-name:var(--font-syne)] text-base font-semibold tracking-tight"
          >
            Authorize purchase
          </h2>
          <p className="mt-1 text-xs text-foreground/55">
            Review the transaction preview. The agent will not pay until you
            confirm.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4 text-sm">
          <dl className="space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/55">Item</dt>
              <dd className="text-right font-medium">{product.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/55">Merchant</dt>
              <dd className="font-mono text-right text-xs">
                /s/{product.storeSlug}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/55">Quantity</dt>
              <dd>1</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/55">Amount</dt>
              <dd className="font-medium">{product.price} USDT0</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-foreground/55">Rail</dt>
              <dd className="text-right">
                {isVisa
                  ? "Visa (agent-authorized card)"
                  : "USDT0 · X Layer Testnet x402"}
              </dd>
            </div>
            {!isVisa && product.tokenization ? (
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/55">Tokenized</dt>
                <dd className="text-right text-xs">
                  {product.tokenization.kind}
                  {product.tokenization.underlying
                    ? ` · ${product.tokenization.underlying}`
                    : null}
                </dd>
              </div>
            ) : null}
          </dl>

          {!isVisa && route ? (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-foreground/75">
              <p className="font-medium text-foreground/85">Liquidity route</p>
              <p className="mt-1">
                Wallet USDT0:{" "}
                <strong>{route.balances?.usdt0Human ?? "—"}</strong>
                {route.balances?.hasEnoughUsdt0
                  ? " (covers purchase)"
                  : " (will route if short)"}
              </p>
              {route.quote ? (
                <p className="mt-1">
                  {route.quote.mode === "live" ? "Live" : "Plan"}:{" "}
                  {route.quote.fromAmountHuman} {route.quote.fromSymbol} → ~
                  {route.quote.toAmountHuman} {route.quote.toSymbol}
                </p>
              ) : null}
              {route.message ? (
                <p className="mt-1 text-xs text-foreground/55">{route.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-relaxed text-foreground/75">
            {isVisa ? (
              <>
                Spend cap ≥ <strong>{product.price}</strong> USDT0 · merchant{" "}
                <span className="font-mono">{product.storeSlug}</span> · mandate
                TTL ~15 min. Agent will charge your authorized virtual card —
                you confirm once.
              </>
            ) : (
              <>
                Intent → route → settle: agent checks balances, routes native →
                USDT0 on X Layer when needed, then x402 PAYMENT-SIGNATURE.
                Protocol micro-fee accrues <strong>network ownership</strong>{" "}
                after settle (merchant still receives full listed amount).
              </>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={onAuthorize}>
            {busy ? "Authorizing…" : "Authorize purchase"}
          </Button>
        </div>
      </div>
    </div>
  );
}
