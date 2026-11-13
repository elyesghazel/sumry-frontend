/**
 * IBAN privacy: a full IBAN is never shown, logged or stored by the apps. What remains is
 * the country code and the last four characters, e.g. `CH•• … 2957`.
 */

const clean = (raw: string): string => raw.replace(/[\s-]/g, '').toUpperCase();

/** `CH93 0076 2011 6238 5295 7` -> `CH•• … 2957`. Empty for empty input. */
export function maskIban(iban: string | null | undefined): string {
  if (!iban) return '';
  const s = clean(iban);
  if (s.length === 0) return '';
  const last4 = s.slice(-4);
  if (s.length <= 6) return `•••• ${last4}`;
  const country = /^[A-Z]{2}/.test(s) ? s.slice(0, 2) : '';
  return `${country}•• … ${last4}`;
}

// Two letters, two check digits, then either 11-30 alphanumerics in one run or groups of
// four separated by spaces. Each spaced group needs a digit so a trailing word such as
// "TWINT" is not swallowed.
const IBAN_IN_TEXT =
  /\b[A-Z]{2}\d{2}(?:[A-Z0-9]{11,30}|(?: (?=[A-Z0-9]{0,3}\d)[A-Z0-9]{4}){2,7}(?: (?=[A-Z0-9]{0,2}\d)[A-Z0-9]{1,3})?)\b/g;

/** Masks every IBAN-looking run inside free text, such as a bank's booking description. */
export function maskIbansIn(text: string): string {
  return text.replace(IBAN_IN_TEXT, (m) => maskIban(m));
}
