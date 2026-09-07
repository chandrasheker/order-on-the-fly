const CURRENCY_PRICE =
  /(?:₹|rs\.?|inr|rupees?|\$)\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?/gi;

export function rupeesStringToPaise(raw: string): number | null {
  const cleaned = String(raw ?? "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const paise = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  if (!Number.isSafeInteger(paise) || paise < 0) return null;
  return paise;
}

export function paiseToRupeeNumber(paise: number): number {
  if (!Number.isInteger(paise) || paise < 0 || !Number.isSafeInteger(paise)) {
    throw new Error("Invalid paise amount");
  }
  return paise / 100;
}

export function formatPaiseAsRupees(paise: number | null | undefined) {
  if (paise == null || !Number.isInteger(paise)) return null;
  return paiseToRupeeNumber(paise);
}

export type ParsedLinePrice = {
  paise: number | null;
  ambiguous: boolean;
  matches: number;
};

export function parsePriceFromLine(line: string): ParsedLinePrice {
  const text = String(line ?? "");
  const range = text.match(
    /(?:(?:₹|rs\.?|inr|\$)\s*)?(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)\s*[\/–—-]\s*(?:(?:₹|rs\.?|inr|\$)\s*)?(\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)/i,
  );
  if (range && Number(range[1].replace(/,/g, "")) >= 10 && Number(range[2].replace(/,/g, "")) >= 10) {
    return { paise: null, ambiguous: true, matches: 2 };
  }

  const currencyMatches: number[] = [];
  const currencyRe = new RegExp(CURRENCY_PRICE.source, CURRENCY_PRICE.flags);
  let found: RegExpExecArray | null;
  while ((found = currencyRe.exec(text))) {
    const token = `${found[1]}${found[2] != null ? `.${found[2]}` : ""}`;
    const paise = rupeesStringToPaise(token);
    if (paise != null) currencyMatches.push(paise);
  }
  if (currencyMatches.length === 1) {
    return { paise: currencyMatches[0], ambiguous: false, matches: 1 };
  }
  if (currencyMatches.length > 1) {
    return { paise: null, ambiguous: true, matches: currencyMatches.length };
  }

  const trailing = text.match(/(?:^|[\s])((?:\d{1,3}(?:,\d{3})+|\d{2,6})(?:\.\d{1,2})?)\s*$/);
  if (trailing) {
    const paise = rupeesStringToPaise(trailing[1]);
    if (paise != null && paise >= 1000) {
      return { paise, ambiguous: false, matches: 1 };
    }
  }

  return { paise: null, ambiguous: false, matches: 0 };
}

export function looksLikeAmbiguousPrice(value: string | null | undefined) {
  if (!value) return false;
  return parsePriceFromLine(value).ambiguous;
}
