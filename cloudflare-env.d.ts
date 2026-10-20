declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    AFFIRMATION_ALLOWED_ORIGINS?: string;
    AFFIRMATION_RATE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  }
}
