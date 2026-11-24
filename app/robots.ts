import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/support", "/privacy", "/terms", "/copyright"],
      disallow: [
        "/api/",
        "/songs/",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: "https://musum.com.ar/sitemap.xml",
    host: "https://musum.com.ar",
  };
}
