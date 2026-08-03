/**
 * Escape a user-supplied string before embedding it in an HTML template.
 * Use this on every piece of user data that appears inside an HTML email or page.
 * Named `h` for brevity — wrap every interpolated value: `${h(name)}`.
 */
export function h(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
