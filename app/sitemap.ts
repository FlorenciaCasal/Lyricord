import type { MetadataRoute } from "next";

const publicRoutes = ["", "/support", "/privacy", "/terms", "/copyright"];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicRoutes.map((route) => ({
    url: `https://musum.com.ar${route}`,
    changeFrequency: route === "" ? "monthly" : "yearly",
    priority: route === "" ? 1 : 0.4,
  }));
}
