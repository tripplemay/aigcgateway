"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface CreateProjectDialogProps {
  trigger: React.ReactNode;
  onCreated?: () => void;
}

export function CreateProjectDialog({ trigger, onCreated }: CreateProjectDialogProps) {
  const t = useTranslations("createProject");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error(t("nameRequired"));
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      toast.success(t("created"));
      setName("");
      setOpen(false);
      onCreated?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<span />}>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="project-name">{t("nameLabel")}</Label>
            <Input
              id="project-name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>
          <Button onClick={handleCreate} disabled={loading} className="w-full">
            {loading ? t("creating") : t("title")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
