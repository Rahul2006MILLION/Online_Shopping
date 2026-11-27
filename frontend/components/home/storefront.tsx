"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Headset, RotateCcw, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/catalogue/product-card";
import { ProductImage } from "@/components/catalogue/product-image";
import { Reveal } from "@/components/motion/reveal";
import { CampaignBanner } from "@/components/home/promo-banner";
import { useI18n } from "@/lib/i18n/i18n-context";
import type { SaleStreamItem } from "@/lib/api/phase3";
import type { Category, ProductSummary, Retailer } from "@/types";

/* ------------------------------------------------------------------ helpers */

export function discountOf(p: ProductSummary) {
  return p.is_in_stock && p.original_price_paise && p.original_price_paise > p.min_price_paise && p.min_price_paise > 0
    ? Math.round(((p.original_price_paise - p.min_price_paise) / p.original_price_paise) * 100)
    : 0;
}

/** First product with a photo for each category slug. */
export function imageByCategory(products: ProductSummary[]) {
  const map = new Map<string, ProductSummary>();
  for (const p of products) if (p.primary_image && !map.has(p.category_slug)) map.set(p.category_slug, p);
  return map;
}

/** Products whose name/category match each pattern, one per pattern, never repeated. */
function pickProducts(products: ProductSummary[], patterns: RegExp[]): (ProductSummary | undefined)[] {
  const used = new Set<string>();
  const withImg = products.filter((p) => p.primary_image);
  const picks = patterns.map((re) => {
    const p = withImg.find((x) => !used.has(x.id) && re.test(`${x.name} ${x.category_slug}`));
    if (p) used.add(p.id);
    return p;
  });
  // Fill gaps with other photographed products so the composition is never empty.
  return picks.map((p) => {
    if (p) return p;
    const f = withImg.find((x) => !used.has(x.id));
    if (f) used.add(f.id);
    return f;
  });
}

/** Translate a string with a {pct}-style slot rendered as a highlighted node. */
function highlightSlot(text: string, render: (suffix: string) => ReactNode) {
  const [before, rest = ""] = text.split("\u0000");
  // Keep a directly following "%" inside the highlight ("60%" reads as one figure).
  const suffix = rest.startsWith("%") ? "%" : "";
  return (
    <>
      {before}
      {render(suffix)}
      {rest.slice(suffix.length)}
    </>
  );
}

export function SectionHead({
  id,
  title,
  subtitle,
  href,
  linkLabel,
  accent = false,
  actions,
}: {
  id: string;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  accent?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 id={`${id}-title`} className="flex items-center gap-4 text-[1.6rem] font-extrabold tracking-[-0.02em] text-ink sm:text-[1.85rem]">
          {title}
          {accent && <span aria-hidden className="mt-1 hidden h-[3px] w-10 rounded-full bg-brand-yellow sm:block" />}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-ink/60">{subtitle}</p>}
      </div>
      {actions}
      {href && linkLabel && (
        <Link
          href={href}
          className="group inline-flex items-center gap-1.5 border-b-2 border-brand-green-logo/25 pb-0.5 text-sm font-bold text-brand-green-logo transition-colors duration-base hover:border-brand-green-logo"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4 transition-transform duration-base ease-out group-hover:translate-x-1" />
        </Link>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ hero */

export function StorefrontHero({
  retailers,
  stats,
}: {
  products: ProductSummary[] | null;
  retailers: Retailer[] | null;
  stats: { products: number; stores: number } | null;
}) {
  const { t, number } = useI18n();
  const faces = (retailers ?? []).filter((r) => r.logo_url).slice(0, 3);

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="container-page grid items-center gap-6 pb-6 pt-6 lg:grid-cols-[46fr_54fr] lg:gap-2 lg:pb-8 lg:pt-4">
        <div className="relative z-10 lg:py-10">
          <Reveal>
            <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.14em] text-ink/80 sm:text-[13px]">
              {t("home.v2.eyebrow")}
              <span aria-hidden className="h-[3px] w-9 rounded-full bg-brand-yellow" />
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 id="hero-title" className="mt-4 text-[2.55rem] font-extrabold leading-[1.04] tracking-[-0.04em] text-ink min-[400px]:text-[2.8rem] sm:text-[4rem] lg:text-[3.65rem] xl:text-[4.15rem]">
              {t("home.v2.title1")}
              <br />
              <span className="whitespace-nowrap">
              <span className="relative -ml-[0.18em] inline-block px-[0.18em]">
                <span aria-hidden className="absolute inset-x-0 bottom-[0.02em] top-[0.12em] -z-10 rounded-full bg-brand-yellow" />
                {t("home.v2.title2")}
              </span>{" "}
              {t("home.v2.title3")}
              </span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-[25rem] text-[15px] leading-relaxed text-ink/80 sm:text-[17px]">{t("home.v2.subtitle")}</p>
          </Reveal>
          <Reveal delay={240} className="mt-7">
            <Link
              href="/products?sort_by=newest"
              className="press group inline-flex h-12 items-center gap-2.5 rounded-full bg-brand-yellow pl-6 pr-5 text-[15px] font-bold text-ink shadow-[0_10px_22px_-12px_rgba(232,184,0,0.95)] hover:bg-brand-yellow-dark"
            >
              {t("home.v2.cta")}
              <ArrowRight className="h-[18px] w-[18px] transition-transform duration-base ease-out group-hover:translate-x-1 rtl:rotate-180" />
            </Link>
          </Reveal>
          <Reveal delay={320}>
            <ul className="mt-8 flex flex-wrap items-center gap-x-3.5 gap-y-3 text-[12px] font-semibold text-ink">
              {stats && (
                <li>
                  <Link href="/retailers" className="group flex items-center gap-2.5">
                    {faces.length > 0 && (
                      <span className="flex -space-x-2">
                        {faces.map((r) => (
                          <span key={r.id} className="relative block h-7 w-7 overflow-hidden rounded-full bg-cream ring-2 ring-surface">
                            <ProductImage src={r.logo_url} alt="" sizes="32px" />
                          </span>
                        ))}
                      </span>
                    )}
                    <span className="group-hover:underline">{t("home.v2.trustStores", { n: number(stats.stores) })}</span>
                  </Link>
                </li>
              )}
              {stats && <li aria-hidden className="hidden h-7 w-px bg-ink/15 sm:block" />}
              <li className="flex items-center gap-2">
                <ShieldCheck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden /> {t("home.v2.trustPayments")}
              </li>
              <li aria-hidden className="hidden h-7 w-px bg-ink/15 sm:block" />
              <li className="flex items-center gap-2">
                <Truck className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden /> {t("home.v2.trustTracking")}
              </li>
            </ul>
          </Reveal>
        </div>

        {/* Product composition artwork (headphones, phone, sneaker, perfume, watch on a podium) */}
        <Reveal delay={60} className="relative mx-auto w-full max-w-[34rem] sm:max-w-[44rem] lg:absolute lg:bottom-0 lg:right-0 lg:mx-0 lg:w-[63%] lg:max-w-none">
          <Link href="/products?sort_by=newest" className="block">
            <Image
              src="/brand/hero-composition.webp"
              alt={t("home.v2.heroArtAlt")}
              width={1728}
              height={762}
              priority
              sizes="(min-width: 1024px) 63vw, 100vw"
              className="h-auto w-full select-none [-webkit-mask-composite:source-in] [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,#000_14%),linear-gradient(to_bottom,transparent,#000_12%)]"
            />
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ trust / benefits bar */

export function ServiceStrip() {
  const { t } = useI18n();
  const items = [
    { icon: Truck, title: t("home.v2.svc.delivery"), body: t("home.v2.svc.deliveryb"), href: "/policies/shipping" },
    { icon: ShieldCheck, title: t("home.v2.svc.payments"), body: t("home.v2.svc.paymentsb"), href: "/policies/privacy" },
    { icon: RotateCcw, title: t("home.v2.svc.returns"), body: t("home.v2.svc.returnsb"), href: "/policies/returns" },
    { icon: Headset, title: t("home.v2.svc.support"), body: t("home.v2.svc.supportb"), href: "/orders" },
  ];
  return (
    <Reveal as="section" className="container-page relative z-10">
      <ul className="grid grid-cols-2 gap-y-3 rounded-3xl bg-white px-2 py-4 shadow-card ring-1 ring-black/[0.04] sm:py-5 lg:grid-cols-4 lg:divide-x lg:divide-ink/10 rtl:lg:divide-x-reverse">
        {items.map(({ icon: Icon, title, body, href }) => (
          <li key={title} className="flex justify-center">
            <Link href={href} className="group flex flex-col items-center gap-2 rounded-xl px-2 py-1 text-center sm:flex-row sm:gap-4 sm:px-4 sm:text-start">
              <Icon className="h-8 w-8 shrink-0 text-ink transition-transform duration-base ease-out group-hover:-translate-y-0.5" strokeWidth={1.6} aria-hidden />
              <span>
                <span className="block text-[14px] font-bold text-ink">{title}</span>
                <span className="block text-[12.5px] text-ink/60">{body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

/* ------------------------------------------------------------------ categories */

const CATEGORY_ORDER = ["electronics", "fashion", "fashion-clothing", "beauty", "beauty-personal-care", "home-kitchen", "furniture-decor", "groceries", "mobiles-accessories", "books-stationery", "sports-fitness"];

export function ShopByCategory({ categories, images }: { categories: Category[]; images: Map<string, ProductSummary> }) {
  const { t } = useI18n();
  const rank = (slug: string) => {
    const i = CATEGORY_ORDER.indexOf(slug);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  const list = categories
    .filter((c) => c.product_count > 0)
    .sort((a, b) => rank(a.slug) - rank(b.slug))
    .slice(0, 8);
  return (
    <section id="shop-by-category" className="container-page pt-12" aria-labelledby="shop-by-category-title">
      <SectionHead id="shop-by-category" title={t("home.v2.categories")} href="/categories" linkLabel={t("home.v2.viewAllCategories")} />
      <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:grid-cols-8">
        {list.map((c, i) => {
          const src = images.get(c.slug)?.primary_image || c.image_url;
          return (
            <Reveal as="li" key={c.id} delay={Math.min(i, 8) * 45} className="w-[7.5rem] shrink-0 snap-start sm:w-auto">
              <Link
                href={`/products?category_slug=${c.slug}`}
                className="group flex h-full flex-col rounded-card bg-white p-2 shadow-card ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-1 hover:shadow-card-hover"
              >
                <span className="relative block aspect-[1.08] overflow-hidden rounded-[0.8rem] bg-cream">
                  <ProductImage src={src} alt="" sizes="(min-width: 1024px) 10vw, (min-width: 640px) 22vw, 7.5rem" className="transition-transform duration-slow ease-out group-hover:scale-[1.08]" />
                </span>
                <span className="flex flex-1 items-center justify-center px-1 pb-1.5 pt-2.5 text-center">
                  <span className="relative text-[13px] font-bold leading-tight text-ink">
                    {c.name}
                    <span aria-hidden className="absolute -bottom-1 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full bg-brand-yellow transition-[width] duration-base ease-out group-hover:w-full" />
                  </span>
                </span>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ deals banner */

/**
 * Wide deals advertisement. The percentage comes only from real data: live flash
 * deals (their real maximum discount) or, if none are running, the largest real
 * saving below MRP in the catalogue. Never a made-up number.
 */
export function DealsBanner({ deals, products }: { deals: SaleStreamItem[]; products: ProductSummary[] }) {
  const { t, number } = useI18n();
  const live = deals.filter((d) => d.event_type === "FLASH_DEAL" && d.seconds_remaining > 0);
  const best = [...products].sort((x, y) => discountOf(y) - discountOf(x))[0];
  let pct = 0;
  let line = "";
  let href = "/sale-stream";
  let lead: { src?: string | null; alt: string } | null = null;
  if (live.length) {
    const top = [...live].sort((x, y) => y.discount_pct - x.discount_pct)[0];
    pct = Math.round(top.discount_pct);
    line = t("home.v2.promoFlash", { n: number(live.length) });
    lead = { src: top.image_url, alt: top.product_name };
  } else if (best && discountOf(best) > 0) {
    pct = discountOf(best);
    line = t("home.v2.promoMrp");
    href = "/products";
    lead = { src: best.primary_image, alt: best.name };
  }
  if (!pct || !lead) return null;
  const [extra] = pickProducts(products.filter((p) => p.primary_image !== lead!.src), [/shoe|sneaker|headphone|watch/i]);
  const title = highlightSlot(t("home.v2.promoTitle", { pct: "\u0000" }), (sfx) => <span className="text-brand-yellow">{pct}{sfx}</span>);
  return (
    <Reveal as="section" className="container-page pt-12">
      <CampaignBanner
        tone="green"
        size="wide"
        eyebrow={t("home.v2.promoEyebrow")}
        title={title}
        body={line}
        cta={t("home.v2.promoCta")}
        href={href}
        images={[lead, extra ? { src: extra.primary_image, alt: extra.name } : { alt: "" }]}
        badge="%"
        ariaLabel={`${t("home.v2.promoEyebrow")}: ${t("home.v2.promoTitle", { pct })}`}
      />
    </Reveal>
  );
}

/** Two half-width campaign ads for marketplace features (group buying, auctions). */
export function CampaignRow({ images }: { images: Map<string, ProductSummary> }) {
  const { t } = useI18n();
  const img = (...slugs: string[]) => {
    for (const s of slugs) {
      const p = images.get(s);
      if (p) return [{ src: p.primary_image, alt: p.name }];
    }
    return [];
  };
  return (
    <section className="container-page grid gap-4 pt-12 md:grid-cols-2" aria-label={t("home.v2.promoEyebrow")}>
      <Reveal>
        <CampaignBanner
          tone="yellow"
          size="compact"
          eyebrow={t("home.v2.promo.group.eyebrow")}
          title={t("home.v2.promo.group.title")}
          body={t("home.v2.promo.group.body")}
          cta={t("home.v2.promo.group.cta")}
          href="/community-buying"
          images={img("fashion", "beauty", "home-kitchen", "groceries")}
        />
      </Reveal>
      <Reveal delay={90}>
        <CampaignBanner
          tone="ink"
          size="compact"
          eyebrow={t("home.v2.promo.auction.eyebrow")}
          title={t("home.v2.promo.auction.title")}
          body={t("home.v2.promo.auction.body")}
          cta={t("home.v2.promo.auction.cta")}
          href="/auctions"
          images={img("electronics", "mobiles-accessories", "computers-laptops")}
        />
      </Reveal>
    </section>
  );
}

/* ------------------------------------------------------------------ the basket edit */

const EDITS: { key: string; slugs: string[]; bg: string; dark?: boolean }[] = [
  { key: "tech", slugs: ["electronics", "computers-laptops", "mobiles-accessories"], bg: "#1C1B19", dark: true },
  { key: "style", slugs: ["fashion", "fashion-clothing"], bg: "#F5ECE2" },
  { key: "home", slugs: ["home-kitchen", "furniture-decor", "home-furniture", "home-appliances"], bg: "#E3EDE5" },
  { key: "beauty", slugs: ["beauty", "beauty-personal-care"], bg: "#F6E8E5" },
  { key: "pantry", slugs: ["groceries"], bg: "#EEF0E0" },
  { key: "active", slugs: ["sports-fitness"], bg: "#E5EBF1" },
  { key: "reading", slugs: ["books-stationery"], bg: "#F1EBDF" },
];

function useRail() {
  const ref = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const x = Math.abs(el.scrollLeft); // RTL scrolls negative
    setEdges({ start: x <= 2, end: x >= max - 2 });
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [update]);
  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    const rtl = getComputedStyle(el).direction === "rtl" ? -1 : 1;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step * rtl, behavior: reduce ? "auto" : "smooth" });
  };
  return { ref, edges, go, update };
}

export function BasketEdit({ categories, images }: { categories: Category[]; images: Map<string, ProductSummary> }) {
  const { t } = useI18n();
  const live = new Map(categories.filter((c) => c.product_count > 0).map((c) => [c.slug, c]));
  const cards = EDITS.flatMap((e) => {
    const slug = e.slugs.find((s) => live.has(s));
    if (!slug) return [];
    return [{ ...e, slug, src: live.get(slug)?.image_url || images.get(slug)?.primary_image }];
  });
  const ready = cards.length > 0;
  const rail = useRail();
  const { update } = rail;
  useEffect(() => {
    if (ready) update();
  }, [ready, update]);
  // The section renders after data arrives, so honour a #the-basket-edit link once it exists.
  useEffect(() => {
    if (!ready || window.location.hash !== "#the-basket-edit") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestAnimationFrame(() => document.getElementById("the-basket-edit")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" }));
  }, [ready]);
  if (!ready) return null;
  const arrow = "press flex h-10 w-10 items-center justify-center rounded-full bg-white text-ink shadow-card ring-1 ring-black/[0.06] hover:bg-ink hover:text-white disabled:pointer-events-none disabled:opacity-40";
  return (
    <section id="the-basket-edit" className="container-page scroll-mt-28 pt-12" aria-labelledby="the-basket-edit-title" aria-roledescription="carousel">
      <SectionHead
        id="the-basket-edit"
        title={t("home.v2.edit")}
        subtitle={t("home.v2.editSub")}
        actions={
          cards.length > 3 ? (
            <div className="hidden gap-2 sm:flex">
              <button type="button" className={arrow} onClick={() => rail.go(-1)} disabled={rail.edges.start} aria-label={t("home.v2.prev")}>
                <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
              </button>
              <button type="button" className={arrow} onClick={() => rail.go(1)} disabled={rail.edges.end} aria-label={t("home.v2.next")}>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" />
              </button>
            </div>
          ) : undefined
        }
      />
      <ul ref={rail.ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-3 pt-1 sm:mx-0 sm:px-0">
        {cards.map((c, i) => (
          <li key={c.key} className="w-[85%] shrink-0 snap-start sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]">
            <Reveal delay={Math.min(i, 3) * 90} className="h-full">
              <Link
                href={`/products?category_slug=${c.slug}`}
                style={{ backgroundColor: c.bg }}
                className="group relative flex h-40 overflow-hidden rounded-card shadow-card ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-base ease-out hover:-translate-y-1 hover:shadow-card-hover sm:h-[10.5rem]"
              >
                <span className="relative z-10 flex w-[52%] flex-col justify-center p-5 sm:p-6">
                  <span className={`text-[1.6rem] font-extrabold leading-[1.02] tracking-[-0.02em] ${c.dark ? "text-white" : "text-ink"}`}>{t(`home.v2.edit.${c.key}`)}</span>
                  <span className={`mt-2 text-xs leading-snug ${c.dark ? "text-white/70" : "text-ink/65"}`}>{t(`home.v2.edit.${c.key}.body`)}</span>
                  <span className={`mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold ${c.dark ? "text-brand-yellow" : "text-ink"}`}>
                    {t("home.v2.explore")}
                    <ArrowRight className="h-3.5 w-3.5 transition-transform duration-base ease-out group-hover:translate-x-1 rtl:rotate-180" />
                  </span>
                </span>
                <span className="absolute inset-y-0 right-0 w-[58%] overflow-hidden [mask-image:linear-gradient(to_right,transparent,#000_38%)]">
                  <ProductImage src={c.src} alt="" sizes="(min-width: 1024px) 18vw, (min-width: 640px) 28vw, 50vw" className="transition-transform duration-slow ease-out group-hover:scale-[1.06]" />
                </span>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ product row */

export function ProductRow({ id, title, subtitle, products, href, linkLabel }: { id: string; title: string; subtitle?: string; products: ProductSummary[]; href: string; linkLabel: string }) {
  if (!products.length) return null;
  return (
    <section id={id} className="container-page pt-12" aria-labelledby={`${id}-title`}>
      <SectionHead id={id} title={title} subtitle={subtitle} href={href} linkLabel={linkLabel} accent />
      <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-3 pt-1 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {products.map((p, i) => (
          <Reveal as="li" key={p.id} delay={Math.min(i, 5) * 60} className="w-[46vw] max-w-[15rem] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <ProductCard product={p} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
