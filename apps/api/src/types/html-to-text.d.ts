// Minimal typing for the one function we use; the package ships no types.
declare module "html-to-text" {
  export function convert(html: string, options?: Record<string, unknown>): string;
}
