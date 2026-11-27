#!/usr/bin/env python3
"""Populate multilingual translations across all supported languages in BASKET.
Expands i18n coverage to cover homepage titles, navigation, footer, cart, checkout,
orders, and catalogue across all 11 Indian languages.
"""
import json, re, time, urllib.request, urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "frontend"
LOC = ROOT / "locales"

NEW_EN_KEYS = {
    # Shopping Cart
    "cart.title": "Shopping Basket",
    "cart.breadcrumb": "Shopping Cart",
    "cart.itemCount": "{n} items",
    "cart.itemCountSingle": "1 item",
    "cart.retailersCount": "Items from {stores} distinct retailers in one unified cart.",
    "cart.clear": "Clear Basket",
    "cart.emptyTitle": "Your Basket is Empty",
    "cart.emptySubtitle": "You haven't added any items to your shopping cart yet. Explore products across multiple retailers and verified brands.",
    "cart.explore": "Explore Products",
    "cart.quoteExpiredTitle": "Pricing Quote Update Required",
    "cart.quoteExpiredSubtitle": "Your 15-minute price guarantee has expired. Retailer catalogue prices and GST calculations must be refreshed before checkout.",
    "cart.refreshQuote": "Accept & Refresh Quote",
    "cart.refreshing": "Refreshing...",
    "cart.seller": "Seller: {name}",
    "cart.taxable": "Base: {price}",
    "cart.tax": "Tax: {price}",
    "cart.unitPrice": "{price} each (incl. GST)",
    "cart.removeItem": "Remove item",
    "cart.substitutes": "Find Suitable Substitutes",
    "cart.alternatives": "Explore Alternatives",
    "cart.onlyLeft": "Only {n} left",
    "cart.orderSummary": "Order Summary",
    "cart.lockedFor": "Locked for {time}",
    "cart.subtotal": "Subtotal (MRP/Catalogue)",
    "cart.deliveryCharges": "Delivery Charges",
    "cart.freeDelivery": "FREE",
    "cart.gstNotice": "Included Indian GST",
    "cart.totalPayable": "Total Payable",
    "cart.totalPayableSubtitle": "Inclusive of all taxes & delivery",
    "cart.stockGuaranteed": "Stock Reserved & Guaranteed",
    "cart.stockGuaranteedBody": "Your items are held for you during checkout, so they cannot be sold to someone else meanwhile.",
    "cart.checkout": "Reserve Stock & Checkout",
    "cart.proceed": "Proceed to Checkout",
    "cart.couponTitle": "Active Promotional Discounts",
    "cart.couponPlaceholder": "Coupon code",
    "cart.apply": "Apply",
    "cart.remove": "Remove",
    "cart.couponApplied": "Coupon applied: {code}",

    # Checkout Flow
    "checkout.title": "Checkout & Order Payment",
    "checkout.subtitle": "Confirm your delivery address and pay securely with Razorpay.",
    "checkout.returnToCart": "Return to Cart",
    "checkout.step1Title": "Step 1: Confirm your order",
    "checkout.step1Subtitle": "Your items are held for you while you check out. Choose where they should be delivered.",
    "checkout.savedAddresses": "Saved Delivery Addresses",
    "checkout.addAddress": "+ Add New Address",
    "checkout.noAddresses": "No addresses saved yet. Add one below.",
    "checkout.orderSummary": "Order Details",
    "checkout.orderNumber": "Order Number: {num}",
    "checkout.itemsCount": "Items in Order: {n}",
    "checkout.paymentSummary": "Payment Summary",
    "checkout.subtotal": "Subtotal:",
    "checkout.gst": "GST (Tax):",
    "checkout.delivery": "Delivery:",
    "checkout.totalPayable": "Total payable:",
    "checkout.confirmAndPay": "Confirm Order & Proceed to Payment",
    "checkout.processing": "Processing order...",
    "checkout.securityNote": "Payments are processed by Razorpay and confirmed by the BASKET server.",
    "checkout.successTitle": "Payment Verified & Order Confirmed!",
    "checkout.trackOrder": "Track Order",
    "checkout.viewDetails": "View Order Details",
    "checkout.myOrders": "My Orders",

    # Orders & Tracking
    "orders.title": "My Orders",
    "orders.subtitle": "View orders, live tracking progress, post-purchase cancellations, and returns.",
    "orders.continueShopping": "Continue Shopping",
    "orders.searchPlaceholder": "Search by order number or product name...",
    "orders.allStatuses": "All Statuses",
    "orders.emptyTitle": "No orders yet",
    "orders.emptySubtitle": "You haven't placed any orders on Basket yet.",
    "orders.startShopping": "Start Shopping",
    "orders.orderNum": "Order #{id}",
    "orders.placedOn": "Placed on {date}",
    "orders.total": "Total: {amount}",
    "orders.track": "Track Order",
    "orders.viewDetails": "View Details",
    "orders.statusDelivered": "Delivered",
    "orders.statusShipped": "Shipped",
    "orders.statusOutForDelivery": "Out for Delivery",
    "orders.statusConfirmed": "Confirmed",
    "orders.statusProcessing": "Processing",
    "orders.statusPending": "Payment Pending",
    "orders.statusCancelled": "Cancelled",
    "orders.statusReturned": "Returned",

    # Catalogue & Products
    "catalogue.allProducts": "All Products",
    "catalogue.filterBy": "Filter by",
    "catalogue.sortBy": "Sort by",
    "catalogue.priceLowHigh": "Price: Low to High",
    "catalogue.priceHighLow": "Price: High to Low",
    "catalogue.inStockOnly": "In Stock Only",
    "catalogue.verifiedSellers": "Verified Sellers",
    "catalogue.specifications": "Specifications",
    "catalogue.customerReviews": "Customer Reviews",
    "catalogue.buyNow": "Buy Now",
    "catalogue.soldBy": "Sold by",
}

PLACEHOLDER = re.compile(r"\{\w+\}")


def protect_placeholders(text: str) -> tuple[str, list[str]]:
    phs = PLACEHOLDER.findall(text)
    protected = text
    for i, ph in enumerate(phs):
        protected = protected.replace(ph, f"__PH{i}__")
    return protected, phs


def restore_placeholders(text: str, phs: list[str]) -> str:
    restored = text
    for i, ph in enumerate(phs):
        restored = re.sub(rf"__\s*PH\s*{i}\s*__", ph, restored, flags=re.IGNORECASE)
    # Ensure all original placeholders exist; if missing, append them
    for ph in phs:
        if ph not in restored:
            restored += f" {ph}"
    return restored


def translate_batch(texts: list[str], lang: str) -> list[str]:
    protected_items = []
    meta = []
    for t in texts:
        p, phs = protect_placeholders(t)
        protected_items.append(p)
        meta.append(phs)

    delim = " ||| "
    joined = delim.join(protected_items)
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + lang + "&dt=t&q=" + urllib.parse.quote(joined)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            translated_joined = "".join([part[0] for part in data[0] if part[0]])
            translated_items = re.split(r"\s*\|\|\|\s*", translated_joined)
            if len(translated_items) != len(texts):
                return [translate_single(t, lang) for t in texts]
            results = []
            for tr, phs in zip(translated_items, meta):
                results.append(restore_placeholders(tr.strip(), phs))
            return results
    except Exception as e:
        print(f"Batch translation failed for {lang} ({e}), falling back to single items...")
        return [translate_single(t, lang) for t in texts]


def translate_single(text: str, lang: str) -> str:
    p, phs = protect_placeholders(text)
    url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" + lang + "&dt=t&q=" + urllib.parse.quote(p)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
    try:
        with urllib.request.urlopen(req, timeout=6) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            tr = "".join([part[0] for part in data[0] if part[0]])
            return restore_placeholders(tr.strip(), phs)
    except Exception as e:
        print(f"Error translating '{text}' to {lang}: {e}")
        return text


def main():
    en_path = LOC / "en.json"
    en = json.loads(en_path.read_text(encoding="utf-8"))

    # 1. Update en.json with new keys
    for k, v in NEW_EN_KEYS.items():
        if k not in en:
            en[k] = v
    en_path.write_text(json.dumps(en, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Updated en.json -> total {len(en)} keys.")

    languages = ["hi", "kn", "ta", "te", "ml", "bn", "mr", "gu", "pa", "or", "ur"]

    for lang in languages:
        lang_path = LOC / f"{lang}.json"
        if not lang_path.exists():
            continue
        d = json.loads(lang_path.read_text(encoding="utf-8"))
        missing_keys = [k for k in en if k not in d]
        print(f"\nProcessing {lang}: {len(missing_keys)} missing keys out of {len(en)}...")

        if not missing_keys:
            continue

        batch_size = 25
        for i in range(0, len(missing_keys), batch_size):
            chunk = missing_keys[i : i + batch_size]
            en_texts = [en[k] for k in chunk]
            translations = translate_batch(en_texts, lang)
            for k, tr in zip(chunk, translations):
                en_phs = sorted(PLACEHOLDER.findall(en[k]))
                tr_phs = sorted(PLACEHOLDER.findall(tr))
                if en_phs != tr_phs:
                    for ph in en_phs:
                        if ph not in tr:
                            tr += f" {ph}"
                d[k] = tr
            print(f"  [{lang}] Translated {min(i + batch_size, len(missing_keys))}/{len(missing_keys)} keys...")
            time.sleep(0.2)

        lang_path.write_text(json.dumps(d, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Saved {lang}.json with {len(d)} keys.")

    print("\nAll language dictionaries successfully expanded!")


if __name__ == "__main__":
    main()
