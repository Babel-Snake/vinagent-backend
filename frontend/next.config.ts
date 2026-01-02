import type { NextConfig } from "next";

console.log("--- NEXT CONFIG START ---");
console.log("API KEY (In Config):", process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? "FOUND" : "MISSING");
console.log("PROJECT ID (In Config):", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
console.log("--- NEXT CONFIG END ---");

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
