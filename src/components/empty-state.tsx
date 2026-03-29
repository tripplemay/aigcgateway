"use client";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/create-project-dialog";

interface EmptyStateProps {
  onCreated?: () => void;
}

export function EmptyState({ onCreated }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface mb-4">
        <FolderPlus className="h-6 w-6 text-text-tertiary" />
      </div>
      <h2 className="text-[15px] font-medium text-text-primary mb-1">No project yet</h2>
      <p className="text-[13px] text-text-tertiary mb-5">
        Create your first project to get started.
      </p>
      <CreateProjectDialog
        trigger={<Button>Create Project</Button>}
        onCreated={onCreated}
      />
    </div>
  );
}
