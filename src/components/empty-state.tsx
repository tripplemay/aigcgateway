"use client";
import * as React from "react";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /**
   * Legacy "no project" fallback — when set and no `title` is given, renders
   * the default "create project" layout. Kept for backward compatibility with
   * existing `<EmptyState onCreated={...} />` call sites.
   */
  onCreated?: () => void;
}

/**
 * EmptyState — generic empty-state block.
 *
 * Explicit usage: pass `icon`/`title`/`description`/`action` for any empty
 * table or page section. Legacy usage: omit all props except `onCreated` and
 * it renders the built-in "create project" prompt.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  onCreated,
}: EmptyStateProps) {
  if (!title && !icon && !description && !action) {
    return <DefaultCreateProjectEmptyState onCreated={onCreated} />;
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-16 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface mb-4 text-text-tertiary">
          {icon}
        </div>
      ) : null}
      {title ? (
        <h2 className="text-[15px] font-medium text-text-primary mb-1">{title}</h2>
      ) : null}
      {description ? (
        <p className="text-[13px] text-text-tertiary mb-5 max-w-md">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

function DefaultCreateProjectEmptyState({ onCreated }: { onCreated?: () => void }) {
  const t = useTranslations("emptyState");
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface mb-4">
        <FolderPlus className="h-6 w-6 text-text-tertiary" />
      </div>
      <h2 className="text-[15px] font-medium text-text-primary mb-1">{t("title")}</h2>
      <p className="text-[13px] text-text-tertiary mb-5">{t("description")}</p>
      <CreateProjectDialog
        trigger={<Button>{t("createButton")}</Button>}
        onCreated={onCreated}
      />
    </div>
  );
}
