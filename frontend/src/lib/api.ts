const PRODUCTION_API = "https://automation-demo-olive.vercel.app";

/** Resolve API base at call time (avoids Next.js bundling the wrong URL). */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:5000";
    }
  }
  return process.env.NEXT_PUBLIC_API_URL || PRODUCTION_API;
}
