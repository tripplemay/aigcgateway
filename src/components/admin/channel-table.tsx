"use client";
import { useTranslations } from "next-intl";
import { formatCNY } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ── Types ──

export interface ChannelRowData {
  id: string;
  modelName: string;
  providerName: string;
  costPrice: Record<string, unknown> | null;
  status: string;
  priority?: number;
  latencyMs?: number | null;
}

interface ChannelTableProps {
  channels: ChannelRowData[];
  exchangeRate: number;
  /** "readonly" hides priority & actions columns; "editable" shows them */
  mode: "readonly" | "editable";
  onUnlink?: (channelId: string, modelId: string) => void;
  /** Map from channelId → modelId for unlinking */
  channelModelMap?: Record<string, string>;
  /** Called after drag reorder with new ordered channel IDs */
  onReorder?: (orderedIds: string[]) => void;
}

// ── Helpers ──

function fmtCostPrice(p: Record<string, unknown> | null, rate: number) {
  if (!p) return "\u2014";
  if (p.unit === "call") {
    const v = Number(p.perCall ?? 0);
    return v === 0 ? "Free" : `${formatCNY(v, rate, 2)}/call`;
  }
  const inp = Number(p.inputPer1M ?? 0);
  const out = Number(p.outputPer1M ?? 0);
  return inp === 0 && out === 0
    ? "Free"
    : `${formatCNY(inp, rate, 2)} / ${formatCNY(out, rate, 2)}`;
}

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string }> = {
  ACTIVE: {
    dot: "bg-ds-secondary",
    bg: "bg-ds-secondary/10",
    text: "text-ds-secondary",
  },
  DEGRADED: {
    dot: "bg-ds-tertiary",
    bg: "bg-ds-tertiary/10",
    text: "text-ds-tertiary",
  },
  DISABLED: {
    dot: "bg-ds-error",
    bg: "bg-ds-error/10",
    text: "text-ds-error",
  },
};

// ── Sortable Row ──

function SortableRow({
  ch,
  exchangeRate,
  mode,
  onUnlink,
  channelModelMap,
  position,
}: {
  ch: ChannelRowData;
  exchangeRate: number;
  mode: "readonly" | "editable";
  onUnlink?: ChannelTableProps["onUnlink"];
  channelModelMap?: Record<string, string>;
  position: number;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ch.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const statusStyle = STATUS_STYLES[ch.status] ?? STATUS_STYLES.DISABLED;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className="bg-ds-surface-container-low group hover:bg-ds-surface-container-high transition-colors"
    >
      {mode === "editable" && (
        <td className="py-3 pl-3 rounded-l-xl w-8">
          <button
            className="cursor-grab active:cursor-grabbing text-ds-on-surface-variant/40 hover:text-ds-on-surface-variant transition-colors touch-none"
            {...attributes}
            {...listeners}
          >
            <span className="material-symbols-outlined text-base">drag_indicator</span>
          </button>
        </td>
      )}
      <td
        className={`py-3 ${mode === "readonly" ? "px-4 rounded-l-xl" : ""} font-mono text-xs font-medium`}
      >
        {ch.modelName}
      </td>
      <td className="py-3 text-xs font-semibold">{ch.providerName}</td>
      <td className="py-3 text-xs font-mono text-ds-on-surface-variant">
        {fmtCostPrice(ch.costPrice, exchangeRate)}
      </td>
      <td className={`py-3 ${mode === "readonly" ? "rounded-r-xl" : ""}`}>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 ${statusStyle.bg} ${statusStyle.text} text-[10px] font-bold rounded uppercase tracking-tighter`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
          {ch.status}
        </span>
      </td>
      {mode === "editable" && (
        <>
          <td className="py-3 text-xs text-ds-on-surface-variant">
            <a
              href="/admin/health"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 hover:text-ds-primary transition-colors"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusStyle.dot}`} />
              <span className="font-bold">
                {ch.latencyMs != null
                  ? ch.latencyMs > 1000
                    ? `${(ch.latencyMs / 1000).toFixed(1)}s`
                    : `${ch.latencyMs}ms`
                  : "\u2014"}
              </span>
            </a>
          </td>
          <td className="py-3 text-center text-xs font-bold text-ds-primary">P{position}</td>
          <td className="py-3 px-4 rounded-r-xl text-right">
            {onUnlink && channelModelMap?.[ch.id] && (
              <button
                className="text-ds-on-surface-variant hover:text-ds-error transition-colors p-1"
                onClick={() => onUnlink(ch.id, channelModelMap[ch.id])}
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

// ── Component ──

export function ChannelTable({
  channels,
  exchangeRate,
  mode,
  onUnlink,
  channelModelMap,
  onReorder,
}: ChannelTableProps) {
  const t = useTranslations("channelTable");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = channels.findIndex((ch) => ch.id === active.id);
    const newIndex = channels.findIndex((ch) => ch.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(channels, oldIndex, newIndex);
    onReorder?.(reordered.map((ch) => ch.id));
  };

  const ids = channels.map((ch) => ch.id);

  if (mode === "editable") {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-y-2">
              <thead>
                <tr className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
                  <th className="pb-2 pl-3 w-8" />
                  <th className="pb-2">{t("colModelId")}</th>
                  <th className="pb-2">{t("colProvider")}</th>
                  <th className="pb-2">{t("colCostPrice")}</th>
                  <th className="pb-2">{t("colStatus")}</th>
                  <th className="pb-2">{t("colHealth")}</th>
                  <th className="pb-2 text-center">{t("colPriority")}</th>
                  <th className="pb-2 pr-4 text-right">{t("colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, i) => (
                  <SortableRow
                    key={ch.id}
                    ch={ch}
                    exchangeRate={exchangeRate}
                    mode={mode}
                    onUnlink={onUnlink}
                    channelModelMap={channelModelMap}
                    position={i + 1}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  // Readonly mode — no DnD
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-separate border-spacing-y-2">
        <thead>
          <tr className="text-[10px] font-bold text-ds-on-surface-variant uppercase tracking-widest">
            <th className="pb-2 pl-4">{t("colModelId")}</th>
            <th className="pb-2">{t("colProvider")}</th>
            <th className="pb-2">{t("colCostPrice")}</th>
            <th className="pb-2">{t("colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((ch) => (
            <SortableRow key={ch.id} ch={ch} exchangeRate={exchangeRate} mode={mode} position={0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
