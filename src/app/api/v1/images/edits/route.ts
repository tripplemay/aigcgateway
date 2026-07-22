export const dynamic = "force-dynamic";
/**
 * POST /v1/images/edits — OpenAI images.edit() 兼容壳
 *
 * BL-IMG-I2I-VISION F-IIV-03 (D4)：解析 multipart/form-data（image 文件 1..n /
 * prompt / model / n / size / response_format），文件在内存转 base64 data URI
 * （不落盘），归一化为 ImageGenerationRequest{prompt, image[]} 后复用
 * generations 的完整共享管道（image-generation-core）。
 *
 * - mask 不支持（首发 i2i 模型均无 mask 语义）→ 400 mask_not_supported
 * - 非 multipart Content-Type → 400 显式提示
 * - 单文件 >5MB / 总大小超限 → 干净 400/413（对齐 vision-limits）
 * - 响应与 generations 同构（data[].url 签名代理），错误信封一致
 */

import { authenticateApiKey } from "@/lib/api/auth-middleware";
import { checkBalance } from "@/lib/api/balance-middleware";
import { errorResponse } from "@/lib/api/errors";
import { generateTraceId } from "@/lib/api/response";
import { executeImageGeneration } from "@/lib/api/image-generation-core";
import { VISION_LIMITS } from "@/lib/api/vision-limits";
import type { ImageGenerationRequest } from "@/lib/engine/types";

/** 单文件字节上限（与 base64 解码上限同源：5MB/张） */
const MAX_FILE_BYTES = VISION_LIMITS.maxBase64DecodedBytes;
/** multipart 总大小上限：10 张 × 5MB + 1MB 余量（表单字段/分隔符开销） */
const MAX_TOTAL_BYTES = VISION_LIMITS.maxImagesPerRequest * MAX_FILE_BYTES + 1024 * 1024;

export async function POST(request: Request) {
  const traceId = generateTraceId();

  // 1. 鉴权
  const auth = await authenticateApiKey(request);
  if (!auth.ok) return auth.error;

  // 2. 余额检查
  const balanceCheck = checkBalance(auth.ctx.user);
  if (!balanceCheck.ok) return balanceCheck.error;

  // 3. Content-Type 门槛：必须 multipart/form-data（OpenAI SDK images.edit 形态）
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return errorResponse(
      400,
      "invalid_parameter",
      'Content-Type must be multipart/form-data (OpenAI images.edit format). For JSON requests, use /v1/images/generations with the "image" parameter.',
    );
  }

  // 4. 总大小 fail-fast：content-length 先审，避免超大 body 全量进内存（D4）
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_TOTAL_BYTES) {
    return errorResponse(
      413,
      "payload_too_large",
      `multipart body (${Math.round(contentLength / (1024 * 1024))}MB) exceeds the ${Math.round(MAX_TOTAL_BYTES / (1024 * 1024))}MB limit`,
    );
  }

  // 5. 解析 multipart
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "invalid_parameter", "Malformed multipart/form-data body");
  }

  // 6. mask 显式拒绝（D4：首发模型均无 mask 语义，本批次不支持）
  if (form.has("mask")) {
    return errorResponse(
      400,
      "mask_not_supported",
      "The mask parameter is not supported. Remove mask and retry (masked editing is not available for current image-to-image models).",
      { param: "mask" },
    );
  }

  // 7. 收集 image 文件（OpenAI SDK 多文件为重复 image 字段；兼容 image[] 命名）
  const files = [...form.getAll("image"), ...form.getAll("image[]")].filter(
    (v): v is File => v instanceof File,
  );
  if (files.length === 0) {
    return errorResponse(
      400,
      "invalid_parameter",
      "at least one image file is required (multipart field: image)",
      { param: "image" },
    );
  }
  if (files.length > VISION_LIMITS.maxImagesPerRequest) {
    return errorResponse(
      400,
      "invalid_parameter",
      `request contains ${files.length} images; maximum is ${VISION_LIMITS.maxImagesPerRequest}`,
      { param: "image" },
    );
  }

  // 8. 逐文件校验（类型/大小）+ 内存转 base64 data URI（不落盘）
  const dataUris: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const param = files.length === 1 ? "image" : `image[${i}]`;
    if (!file.type.startsWith("image/")) {
      return errorResponse(
        400,
        "invalid_parameter",
        `${param} content type "${file.type || "unknown"}" is not an image (expected image/*)`,
        { param },
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      const maxMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
      return errorResponse(
        400,
        "invalid_parameter",
        `${param} (${Math.round(file.size / 1024)}KB) exceeds the ${maxMb}MB limit`,
        { param },
      );
    }
    const buf = Buffer.from(await file.arrayBuffer());
    dataUris.push(`data:${file.type};base64,${buf.toString("base64")}`);
  }

  // 9. 标量字段归一化
  const model = form.get("model");
  const prompt = form.get("prompt");

  let n: number | undefined;
  const nRaw = form.get("n");
  if (typeof nRaw === "string" && nRaw.length > 0) {
    n = Number(nRaw);
    if (!Number.isInteger(n) || n < 1) {
      return errorResponse(400, "invalid_parameter", "n must be a positive integer", {
        param: "n",
      });
    }
  }

  const sizeRaw = form.get("size");
  const size = typeof sizeRaw === "string" && sizeRaw.length > 0 ? sizeRaw : undefined;

  let responseFormat: "url" | "b64_json" | undefined;
  const rfRaw = form.get("response_format");
  if (typeof rfRaw === "string" && rfRaw.length > 0) {
    if (rfRaw !== "url" && rfRaw !== "b64_json") {
      return errorResponse(
        400,
        "invalid_parameter",
        'response_format must be "url" or "b64_json"',
        { param: "response_format" },
      );
    }
    responseFormat = rfRaw;
  }

  // 10. 归一化为内部请求，走与 generations 完全相同的共享管道
  //（model/prompt 必填校验、源图校验、i2i 门禁、限流、计费、日志均在 core）
  const body: ImageGenerationRequest = {
    model: typeof model === "string" ? model : "",
    prompt: typeof prompt === "string" ? prompt : "",
    image: dataUris,
    ...(n !== undefined ? { n } : {}),
    ...(size !== undefined ? { size } : {}),
    ...(responseFormat !== undefined ? { response_format: responseFormat } : {}),
  };

  return executeImageGeneration(request, auth.ctx, body, traceId);
}
