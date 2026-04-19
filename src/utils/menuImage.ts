const MENU_UPLOADS_PATH = "/api/uploads/menu/";

export function getOptimizedMenuImageUrl(url: string, width: number) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes(MENU_UPLOADS_PATH)) {
      return url;
    }
    parsed.searchParams.set("w", String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}
