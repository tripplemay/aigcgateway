export interface GatewayConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retry?: RetryConfig;
  fetch?: typeof fetch;
  defaultHeaders?: Record<string, string>;
}

export interface RetryConfig {
  maxRetries?: number;
  retryOn?: number[];
  initialDelay?: number;
  backoffMultiplier?: number;
  maxDelay?: number;
}
