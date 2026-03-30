# AIGC Gateway SDK

Official TypeScript SDK for AIGC Gateway. Zero dependencies, Node 18+.

## Installation

```bash
npm install @guangai/aigc-sdk
```

## Quick Start

```typescript
import { Gateway } from '@guangai/aigc-sdk'

const gw = new Gateway({
  apiKey: 'pk_your_api_key',
  baseUrl: 'https://aigc.guangai.ai', // optional
})
```

## Chat (Non-Streaming)

```typescript
const res = await gw.chat({
  model: 'deepseek/v3',
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is quantum computing?' },
  ],
  temperature: 0.7,
  max_tokens: 1024,
})

console.log(res.content)       // Model output
console.log(res.traceId)       // Trace ID for audit
console.log(res.usage)         // { promptTokens, completionTokens, totalTokens }
console.log(res.finishReason)  // 'stop' | 'length' | 'tool_calls' | 'content_filter'
```

## Chat (Streaming)

```typescript
const stream = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: 'Write a poem' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.content)
}

console.log('TraceId:', stream.traceId)
console.log('Usage:', stream.usage)
```

### Collect Stream into Full Response

```typescript
const stream = await gw.chat({ model: 'deepseek/v3', messages: [...], stream: true })
const res = await stream.collect()
console.log(res.content)  // Complete text
```

### Abort Stream

```typescript
const stream = await gw.chat({ ..., stream: true })
setTimeout(() => stream.abort(), 5000)
```

## Image Generation

```typescript
const img = await gw.image({
  model: 'zhipu/cogview-3-flash',
  prompt: 'A robot teaching children to paint',
  size: '1024x1024',
})

console.log(img.url)       // Image URL (valid for 1 hour)
console.log(img.traceId)
```

## List Models

```typescript
const all = await gw.models()
const textOnly = await gw.models({ modality: 'text' })
const imageOnly = await gw.models({ modality: 'image' })

for (const m of all) {
  console.log(`${m.id} — ${m.displayName} — ${m.modality}`)
}
```

## Error Handling

```typescript
import {
  Gateway,
  AuthError,
  InsufficientBalanceError,
  RateLimitError,
  ProviderError,
  ModelNotFoundError,
  NoChannelError,
  ContentFilteredError,
  ConnectionError,
  GatewayError,
} from '@guangai/aigc-sdk'

try {
  await gw.chat({ ... })
} catch (e) {
  if (e instanceof InsufficientBalanceError) {
    console.log(`Low balance: $${e.balance}`)
  } else if (e instanceof RateLimitError) {
    console.log(`Rate limited, retry after ${e.retryAfter}s`)
  } else if (e instanceof ModelNotFoundError) {
    console.log(`Model not found: ${e.model}`)
  } else if (e instanceof AuthError) {
    console.log('Invalid API key')
  } else if (e instanceof ProviderError) {
    console.log(`Provider error: ${e.message}`)
  } else if (e instanceof ConnectionError) {
    console.log(`Connection error: ${e.cause}`)  // 'timeout' | 'network' | 'abort'
  } else if (e instanceof GatewayError) {
    console.log(`Error ${e.status}: ${e.code} — ${e.message}`)
  }
}
```

## Configuration

```typescript
const gw = new Gateway({
  apiKey: 'pk_...',           // Required
  baseUrl: 'https://...',     // Default: none (must provide)
  timeout: 30000,             // Request timeout in ms (default: 30s)
  retry: {
    maxRetries: 2,            // Max retries (default: 2)
    retryOn: [429, 500, 502, 503],  // Status codes to retry
    initialDelay: 1000,       // First retry delay in ms
    backoffMultiplier: 2,     // Exponential backoff multiplier
    maxDelay: 30000,          // Max delay cap in ms
  },
  defaultHeaders: {},         // Custom headers for all requests
  fetch: customFetch,         // Custom fetch implementation
})
```

## Retry Strategy

- Retries on: `429`, `500`, `502`, `503`
- Does NOT retry: `400`, `401`, `402`, `403`, `404`, `422`
- 429 responses: uses `Retry-After` header value
- Streaming: only retries before connection is established
- Exponential backoff: `1s → 2s → 4s` (configurable)

## License

MIT
