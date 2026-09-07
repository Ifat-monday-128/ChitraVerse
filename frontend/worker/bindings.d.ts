declare namespace Cloudflare {
  interface Env {
    // Optional until a D1 binding is configured in .openai/hosting.json.
    DB?: D1Database;
  }
}
