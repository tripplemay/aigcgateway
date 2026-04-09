export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { verifyJwt } from "@/lib/api/jwt-middleware";
import { errorResponse } from "@/lib/api/errors";
import type { StepRole, Prisma } from "@prisma/client";

type Params = { params: { id: string } };

// POST /api/projects/:id/templates/fork — Fork 公共模板到项目
export async function POST(request: Request, { params }: Params) {
  const auth = verifyJwt(request);
  if (!auth.ok) return auth.error;

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId: auth.payload.userId },
  });
  if (!project) return errorResponse(404, "not_found", "Project not found");

  const body = await request.json();
  const { sourceTemplateId } = body;
  if (!sourceTemplateId) {
    return errorResponse(400, "invalid_parameter", "sourceTemplateId is required");
  }

  // Load source template with steps + actions + active version
  const source = await prisma.template.findFirst({
    where: { id: sourceTemplateId, isPublic: true },
    include: {
      steps: {
        orderBy: { order: "asc" },
        include: {
          action: {
            include: {
              versions: {
                where: { actionId: sourceTemplateId },
                orderBy: { versionNumber: "desc" },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!source) {
    return errorResponse(404, "not_found", "Public template not found");
  }

  // Reload actions properly — get active versions for each action
  const sourceActionIds = [...new Set(source.steps.map((s) => s.actionId))];
  const sourceActions = await prisma.action.findMany({
    where: { id: { in: sourceActionIds } },
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1,
      },
    },
  });
  const sourceActionMap = new Map(sourceActions.map((a) => [a.id, a]));

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Deep copy Actions — check for existing by name in target project
      const actionIdMapping = new Map<string, string>();

      for (const srcActionId of sourceActionIds) {
        const srcAction = sourceActionMap.get(srcActionId);
        if (!srcAction) continue;

        // Check if user project already has an action with same name
        const existing = await tx.action.findFirst({
          where: { projectId: project.id, name: srcAction.name },
        });

        if (existing) {
          actionIdMapping.set(srcActionId, existing.id);
        } else {
          const latestVersion = srcAction.versions[0];
          const newAction = await tx.action.create({
            data: {
              projectId: project.id,
              name: srcAction.name,
              description: srcAction.description,
              model: srcAction.model,
            },
          });

          // Copy the latest version if exists
          if (latestVersion) {
            const newVersion = await tx.actionVersion.create({
              data: {
                actionId: newAction.id,
                versionNumber: 1,
                messages: latestVersion.messages as Prisma.InputJsonValue,
                variables: latestVersion.variables as Prisma.InputJsonValue,
                changelog: "Forked from public template",
              },
            });
            await tx.action.update({
              where: { id: newAction.id },
              data: { activeVersionId: newVersion.id },
            });
          }

          actionIdMapping.set(srcActionId, newAction.id);
        }
      }

      // Step 2: Create forked Template
      const forkedTemplate = await tx.template.create({
        data: {
          projectId: project.id,
          name: source.name,
          description: source.description,
          sourceTemplateId: source.id,
          isPublic: false,
        },
      });

      // Step 3: Copy TemplateSteps with mapped action IDs
      for (const step of source.steps) {
        const mappedActionId = actionIdMapping.get(step.actionId);
        if (!mappedActionId) continue;

        await tx.templateStep.create({
          data: {
            templateId: forkedTemplate.id,
            actionId: mappedActionId,
            order: step.order,
            role: step.role as StepRole,
          },
        });
      }

      // Return complete forked template
      return tx.template.findUniqueOrThrow({
        where: { id: forkedTemplate.id },
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: { action: { select: { id: true, name: true, model: true } } },
          },
        },
      });
    });

    const copiedActions = new Set(source.steps.map((s) => s.actionId)).size;

    return NextResponse.json(
      {
        template: result,
        copiedActions,
        message: `Template "${source.name}" forked successfully`,
      },
      { status: 201 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Fork failed";
    return errorResponse(500, "internal_error", msg);
  }
}
