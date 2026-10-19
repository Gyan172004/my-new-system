export function safeReturnPath(value: string | null | undefined): string {
  return value &&
    /^\/(?:problems(?:\/[a-z0-9-]{1,100})?|sessions(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)?$/i.test(
      value,
    )
    ? value
    : '/';
}
