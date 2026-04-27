# Image Pricing Audit (2026-04-27)

BL-RECON-FIX-PHASE1 F-RF-03 — read-only audit of image-modality models and their channel cost configurations.

## Summary

- Image modality models: **39**
- Channels using token-priced costPrice (⚠️ suspect for image modality): **7**
- Channels using perCall costPrice (reasonable): **32**
- Channels with other / unknown costPrice shape: **0**

Window for 30-day call_logs aggregates: `2026-03-28T06:33:08.215Z` → `2026-04-27T06:33:08.215Z`

⚠️ marker means: modality=IMAGE AND channel.costPrice.unit==='token'. Image models charged by token may undercount when upstream bills per-call (e.g. openrouter image models).

## Per-Model Breakdown

### `cogview-3` (Cogview-3)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| zhipu | `cmnujsns900fhbnrzmnf793q2` | `{unit:'token', in/1M:0, out/1M:0.0027}` | `{unit:'call', perCall:0.0429}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `dall-e-2` (DALL·E 2)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0lk013gbnxchdxs55ch` | `{unit:'call', perCall:0.02}` | `{unit:'call', perCall:0.024}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `dall-e-3` (DALL·E 3)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0lb013dbnxcmm6ny1e5` | `{unit:'call', perCall:0.04}` | `{unit:'call', perCall:0.048}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gemini-2.5-flash-image-preview` (gemini-2.5-flash-image-preview)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0lw013jbnxctqm8tyt6` | `{unit:'call', perCall:0.042}` | `{unit:'call', perCall:0.0504}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gemini-3-pro-image-preview` (gemini-3-pro-image-preview)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0mq013sbnxc9vjqcoyz` | `{unit:'call', perCall:0.042}` | `{unit:'call', perCall:0.0504}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gemini-3.1-flash-image-preview` (gemini-3.1-flash-image-preview)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0m5013mbnxc1qhphm0a` | `{unit:'call', perCall:0.042}` | `{unit:'call', perCall:0.0504}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `google/gemini-2.5-flash-image` (Google: Nano Banana (Gemini 2.5 Flash Image))

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmnpqumpb008zbnxc2t47ollt` | `{unit:'token', in/1M:0.3, out/1M:2.5}` | `{unit:'token', in/1M:0.36, out/1M:3}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `6`
- Sum costPrice: `$0.0162`
- Sum sellPrice: `$0.0194`
- Avg costPrice/call: `$0.0027`
- Avg sellPrice/call: `$0.0032`

### `google/gemini-3-pro-image-preview` (Google: Nano Banana Pro (Gemini 3 Pro Image Preview))

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmnpqumjc006wbnxceftbpqv3` | `{unit:'token', in/1M:2, out/1M:12}` | `{unit:'token', in/1M:2.4, out/1M:14.4}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `google/gemini-3.1-flash-image-preview` (Google: Nano Banana 2 (Gemini 3.1 Flash Image Preview))

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmnpqum5m002bbnxcr4b4v3ew` | `{unit:'token', in/1M:0.5, out/1M:3}` | `{unit:'token', in/1M:0.6, out/1M:3.6}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gpt-image-1` (gpt-image-1)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0mf013pbnxcysr06pxa` | `{unit:'call', perCall:0.042}` | `{unit:'call', perCall:0.0504}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gpt-image-1-mini` (gpt-image-1-mini)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0nd013ybnxcex3iuglj` | `{unit:'call', perCall:0.011}` | `{unit:'call', perCall:0.0132}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gpt-image-1.5` (gpt-image-1.5)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmnpqv0n2013vbnxcui7y73rp` | `{unit:'call', perCall:0.009}` | `{unit:'call', perCall:0.0108}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gpt-image-2` (gpt-image-2)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmoayey2y0mi7bnvxr667x1z6` | `{unit:'call', perCall:0.042}` | `{unit:'call', perCall:0.0504}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `gpt-image-2-ca` (gpt-image-2-ca)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openai | `cmoayey2x0mi6bnvxmydm6jat` | `{unit:'call', perCall:0.042}` | `{unit:'call', perCall:0.0504}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `openai/gpt-5-image` (OpenAI: GPT-5 Image)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmnpqumo4008kbnxck2puju4i` | `{unit:'token', in/1M:10, out/1M:10}` | `{unit:'token', in/1M:12, out/1M:12}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `openai/gpt-5-image-mini` (OpenAI: GPT-5 Image Mini)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmnpqumn40088bnxcn4z62t2x` | `{unit:'token', in/1M:2.5, out/1M:2}` | `{unit:'token', in/1M:3, out/1M:2.4}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `openai/gpt-5.4-image-2` (OpenAI: GPT-5.4 Image 2)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| openrouter | `cmo9iyi2w0buxbnvxe4c1aaqt` | `{unit:'token', in/1M:8, out/1M:15}` | `{unit:'token', in/1M:9.6, out/1M:18}` | ACTIVE | ⚠️ token-priced image |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-2.0` (qwen-image-2.0)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegio0039bnsef0msh0bb` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-2.0-2026-03-03` (qwen-image-2.0-2026-03-03)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegh8002wbnsedae7k05n` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-2.0-pro` (qwen-image-2.0-pro)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukeghk0031bnsevhekxg4x` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-2.0-pro-2026-03-03` (qwen-image-2.0-pro-2026-03-03)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegi40035bnsegwbx3ueq` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-2.0-pro-2026-04-22` (qwen-image-2.0-pro-2026-04-22)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmoca6bxz0001bnsmjykljq2k` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-edit-max` (qwen-image-edit-max)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegrj006pbnse7j3gtb0d` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-edit-max-2026-01-16` (qwen-image-edit-max-2026-01-16)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegr8006kbnsen8lptjys` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-edit-plus` (qwen-image-edit-plus)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegya0099bnsefir3brxy` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-edit-plus-2025-10-30` (qwen-image-edit-plus-2025-10-30)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegxz0095bnsexkx0poni` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-edit-plus-2025-12-15` (qwen-image-edit-plus-2025-12-15)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegu2007nbnses5kt4rbd` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-max` (qwen-image-max)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegss0076bnse64juomn7` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-max-2025-12-30` (qwen-image-max-2025-12-30)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegsj0072bnsecdbcdwgj` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen-image-plus-2026-01-09` (qwen-image-plus-2026-01-09)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegrt006tbnse1dnwjede` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen/qwen-image` (Qwen/Qwen-Image)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| siliconflow | `cmnujtxfs00jmbnrzj2c9t6tp` | `{unit:'call', perCall:0.02}` | `{unit:'call', perCall:0.024}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen/qwen-image-edit` (Qwen/Qwen-Image-Edit)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| siliconflow | `cmnujtxfg00jjbnrz0slsyj1j` | `{unit:'call', perCall:0.04}` | `{unit:'call', perCall:0.048}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `qwen/qwen-image-edit-2509` (Qwen/Qwen-Image-Edit-2509)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| siliconflow | `cmnujtxf300jgbnrzuj14zlnp` | `{unit:'call', perCall:0.04}` | `{unit:'call', perCall:0.048}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `seedream-3.0` (Seedream 3.0)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| volcengine | `cmnpquy5m00rwbnxcc0omrhet` | `{unit:'call', perCall:0.037}` | `{unit:'call', perCall:0.0444}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `seedream-4.0` (Seedream 4.0)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| volcengine | `cmnpquy5y00rzbnxcxuixo8q8` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `seedream-4.5` (Seedream 4.5)

- Modality: `IMAGE`
- Enabled: `true`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| volcengine | `cmnpquy6c00s2bnxciwqef9po` | `{unit:'call', perCall:0.0357}` | `{unit:'call', perCall:0.0429}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `wan2.7-image` (wan2.7-image)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegfk002gbnsewzxcheko` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `wan2.7-image-pro` (wan2.7-image-pro)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegez0029bnse0d9akksv` | `{unit:'call', perCall:0.0714}` | `{unit:'call', perCall:0.0857}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

### `z-image-turbo` (z-image-turbo)

- Modality: `IMAGE`
- Enabled: `false`
- Channels: 1

| Provider | Channel ID | costPrice | sellPrice | Status | Marker |
|---|---|---|---|---|---|
| qwen | `cmnukegtg007ebnse2ikscfku` | `{unit:'call', perCall:0.0286}` | `{unit:'call', perCall:0.0343}` | ACTIVE | — |

**30-day call_logs:**

- Total calls: `0`
- Sum costPrice: `$0.0000`
- Sum sellPrice: `$0.0000`
- Avg costPrice/call: `$0.0000`
- Avg sellPrice/call: `$0.0000`

---

## Notes

- This script is **read-only**: it only invokes `prisma.*.findMany / aggregate`.
- Phase 2 decision: review each ⚠️ row and confirm whether the upstream provider charges per-call (translate to `{perCall:N}`) or actually charges by token (no change required).
- Sources of truth for upstream pricing:
  - openrouter: https://openrouter.ai/models — shows per-image price for image-via-chat models
  - volcengine ark: per-resolution flat fee (configured via SystemConfig)
  - chatanywhere / siliconflow: provider docs
