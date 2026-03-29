export class GatewayError extends Error {
  status: number;
  code: string;
  type: string;
  param?: string;
  raw?: unknown;

  constructor(
    message: string,
    status: number,
    code: string,
    type: string,
    extra?: { param?: string; raw?: unknown },
  ) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
    this.type = type;
    this.param = extra?.param;
    this.raw = extra?.raw;
  }
}

export class AuthError extends GatewayError {
  constructor(message: string, raw?: unknown) {
    super(message, 401, "invalid_api_key", "authentication_error", { raw });
    this.name = "AuthError";
  }
}

export class InsufficientBalanceError extends GatewayError {
  balance: number;
  constructor(message: string, balance: number, raw?: unknown) {
    super(message, 402, "insufficient_balance", "billing_error", { raw });
    this.name = "InsufficientBalanceError";
    this.balance = balance;
  }
}

export class ModelNotFoundError extends GatewayError {
  model: string;
  constructor(message: string, model: string, raw?: unknown) {
    super(message, 404, "model_not_found", "not_found_error", { raw });
    this.name = "ModelNotFoundError";
    this.model = model;
  }
}

export class InvalidParameterError extends GatewayError {
  override param: string;
  constructor(message: string, param: string, raw?: unknown) {
    super(message, 422, "invalid_parameter", "invalid_request_error", {
      param,
      raw,
    });
    this.name = "InvalidParameterError";
    this.param = param;
  }
}

export class RateLimitError extends GatewayError {
  retryAfter: number;
  constructor(message: string, retryAfter: number, raw?: unknown) {
    super(message, 429, "rate_limit_exceeded", "rate_limit_error", { raw });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class ProviderError extends GatewayError {
  constructor(
    message: string,
    code: "provider_error" | "provider_timeout" = "provider_error",
    raw?: unknown,
  ) {
    super(message, 502, code, "upstream_error", { raw });
    this.name = "ProviderError";
  }
}

export class NoChannelError extends GatewayError {
  model: string;
  constructor(message: string, model: string, raw?: unknown) {
    super(message, 503, "no_available_channel", "service_unavailable_error", {
      raw,
    });
    this.name = "NoChannelError";
    this.model = model;
  }
}

export class ContentFilteredError extends GatewayError {
  constructor(message: string, raw?: unknown) {
    super(message, 400, "content_filtered", "invalid_request_error", { raw });
    this.name = "ContentFilteredError";
  }
}

export class ConnectionError extends GatewayError {
  override cause: string;
  constructor(message: string, cause: "timeout" | "network" | "abort") {
    super(message, 0, "connection_error", "connection_error");
    this.name = "ConnectionError";
    this.cause = cause;
  }
}

/**
 * 从 HTTP 响应映射到对应错误类
 */
export function mapResponseToError(
  status: number,
  body: { error?: { code?: string; message?: string; param?: string; balance?: number } },
  headers: Headers,
  requestModel?: string,
): GatewayError {
  const err = body.error;
  const message = err?.message ?? `Request failed with status ${status}`;

  switch (status) {
    case 401:
      return new AuthError(message, body);
    case 402:
      return new InsufficientBalanceError(
        message,
        err?.balance ?? 0,
        body,
      );
    case 404:
      if (err?.code === "model_not_found") {
        return new ModelNotFoundError(message, requestModel ?? "", body);
      }
      return new GatewayError(message, 404, err?.code ?? "not_found", "not_found_error", { raw: body });
    case 422:
      return new InvalidParameterError(message, err?.param ?? "", body);
    case 429: {
      const retryAfter = Number(headers.get("retry-after") ?? 60);
      return new RateLimitError(message, retryAfter, body);
    }
    case 502:
      return new ProviderError(
        message,
        err?.code === "provider_timeout" ? "provider_timeout" : "provider_error",
        body,
      );
    case 503:
      return new NoChannelError(message, requestModel ?? "", body);
    case 400:
      if (err?.code === "content_filtered") {
        return new ContentFilteredError(message, body);
      }
      return new GatewayError(message, 400, err?.code ?? "invalid_request", "invalid_request_error", {
        param: err?.param,
        raw: body,
      });
    default:
      return new GatewayError(message, status, err?.code ?? "unknown", "server_error", { raw: body });
  }
}
