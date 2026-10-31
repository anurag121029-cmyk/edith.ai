import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/features", "/privacy", "/terms", "/login", "/signup"],
      disallow: ["/dashboard", "/chat", "/study", "/tasks", "/workload", "/mood", "/insights", "/memories", "/image", "/voice", "/settings", "/onboarding", "/api/", "/auth/"],
    },
  };
}
