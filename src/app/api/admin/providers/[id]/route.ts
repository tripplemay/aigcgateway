export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/admin-guard";
import { errorResponse } from "@/lib/api/errors";

// F-AO2-01: hard-delete a Provider with cascade cleanup.
//
// Cascade semantics (per BL-099 decisions):
//   - All Channels under the provider are hard-deleted (HealthCheck rows
//     cascade via FK onDelete=Cascade).
//   - CallLog.channelId is set to NULL so historical audit rows survive.
//   - ProviderConfig is removed.
//   - For every Model that loses its last remaining Channel after the
//     delete, we disable it (enabled=false) and strip its AliasModelLinks.
//   - For every ModelAlias that ends up with no enabled Models, we disable
//     it (enabled=false). Brand metadata stays put.
//
// Supports ?dry_run=true — the DELETE body returns the same envelope but
// without committing anything. We implement dry-run by computing counts in
// a read-only transaction and rolling it back.

interface DeleteImpact {
  providerId: string;
  deletedChannels: number;
  nulledCallLogs: number;
  affectedModels: number;
  disabledModels: number;
  affectedAliases: number;
  disabledAliases: number;
  dryRun: boolean;
}

async function performProviderDelete(
  providerId: string,
  dryRun: boolean,
): Promise<DeleteImpact | "not_found"> {
  return await prisma.$transaction(async (tx) => {
    const provider = await tx.provider.findUnique({ where: { id: providerId } });
    if (!provider) return "not_found" as const;

    const channels = await tx.channel.findMany({
      where: { providerId },
      select: { id: true, modelId: true },
    });
    const channelIds = channels.map((c) => c.id);
    const touchedModelIds = Array.from(new Set(channels.map((c) => c.modelId)));

    const nulledCallLogs = channelIds.length
      ? await tx.callLog.count({ where: { channelId: { in: channelIds } } })
      : 0;

    // Perform the actual mutations — under a dry run we roll back at the end.
    if (channelIds.length > 0) {
      await tx.callLog.updateMany({
        where: { channelId: { in: channelIds } },
        data: { channelId: null },
      });
      await tx.channel.deleteMany({ where: { id: { in: channelIds } } });
    }
    await tx.providerConfig.deleteMany({ where: { providerId } });

    // Models that lost their last channel → disable and unlink from aliases.
    const disabledModelIds: string[] = [];
    for (const modelId of touchedModelIds) {
      const remaining = await tx.channel.count({ where: { modelId } });
      if (remaining === 0) {
        await tx.aliasModelLink.deleteMany({ where: { modelId } });
        await tx.model.update({ where: { id: modelId }, data: { enabled: false } });
        disabledModelIds.push(modelId);
      }
    }

    // Aliases that lost every enabled model → disable but keep the row.
    let affectedAliases = 0;
    let disabledAliases = 0;
    if (disabledModelIds.length > 0) {
      const touchedAliases = await tx.aliasModelLink.findMany({
        where: { modelId: { in: disabledModelIds } },
        select: { aliasId: true },
      });
      // Note: because we already deleted the links above, touchedAliases
      // comes back empty. Instead, enumerate every alias and recompute.
      const allAliases = await tx.modelAlias.findMany({
        where: { enabled: true },
        select: { id: true },
      });
      for (const a of allAliases) {
        const stillEnabled = await tx.aliasModelLink.findFirst({
          where: { aliasId: a.id, model: { enabled: true } },
          select: { id: true },
        });
        if (!stillEnabled) {
          affectedAliases += 1;
          await tx.modelAlias.update({ where: { id: a.id }, data: { enabled: false } });
          disabledAliases += 1;
        }
      }
    }

    await tx.provider.delete({ where: { id: providerId } });

    const impact: DeleteImpact = {
      providerId,
      deletedChannels: channelIds.length,
      nulledCallLogs,
      affectedModels: touchedModelIds.length,
      disabledModels: disabledModelIds.length,
      affectedAliases,
      disabledAliases,
      dryRun,
    };

    if (dryRun) {
      // Roll the transaction back by throwing a sentinel and catching outside.
      throw new DryRunRollback(impact);
    }
    return impact;
  });
}

class DryRunRollback extends Error {
  constructor(public impact: DeleteImpact) {
    super("dry_run");
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "true";

  try {
    const result = await performProviderDelete(params.id, dryRun);
    if (result === "not_found") {
      return errorResponse(404, "not_found", "Provider not found");
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof DryRunRollback) {
      return NextResponse.json(err.impact);
    }
    return errorResponse(500, "delete_failed", (err as Error).message);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = requireAdmin(request);
  if (!auth.ok) return auth.error;

  const body = await request.json();
  const { displayName, baseUrl, authType, apiKey, adapterType, proxyUrl, status, rateLimit } = body;

  const data: Record<string, unknown> = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (baseUrl !== undefined) data.baseUrl = baseUrl;
  if (authType !== undefined) data.authType = authType;
  if (apiKey !== undefined) data.authConfig = { apiKey };
  if (adapterType !== undefined) data.adapterType = adapterType;
  if (proxyUrl !== undefined) data.proxyUrl = proxyUrl;
  if (status !== undefined) data.status = status;
  if (rateLimit !== undefined) data.rateLimit = rateLimit;

  const provider = await prisma.provider.update({
    where: { id: params.id },
    data,
  });

  return NextResponse.json(provider);
}
