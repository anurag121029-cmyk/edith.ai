import type { MetadataRoute } from "next";
const PUBLIC_ROUTES = ["/", "/features", "/privacy", "/terms", "/login", "/signup"];
export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return PUBLIC_ROUTES.map((path) => ({ url: `${base}${path}`, lastModified: new Date() }));
}
