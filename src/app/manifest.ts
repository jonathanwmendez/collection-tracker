import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Collection Tracker",
    short_name: "Collection",
    description: "Catalog collectibles from photos, with verified market prices.",
    start_url: "/add",
    display: "standalone",
    background_color: "#f3f5f8",
    theme_color: "#1f3864",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
