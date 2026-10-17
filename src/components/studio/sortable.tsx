"use client";
import * as React from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Vertical drag & drop list (mouse, touch and keyboard: focus the handle, Space, arrows, Space).
 */
export function SortableList<T>({
  items,
  getId,
  onReorder,
  children,
  className,
  label = "ลากเพื่อเรียงลำดับ",
}: {
  items: T[];
  getId: (item: T) => string;
  onReorder: (next: T[]) => void;
  children: (item: T, index: number) => React.ReactNode;
  className?: string;
  label?: string;
}) {
  const id = React.useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(getId);
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: { draggable: `${label}: กด Space เพื่อหยิบ ใช้ลูกศรขึ้นลงเพื่อย้าย แล้วกด Space อีกครั้งเพื่อวาง` },
        announcements: {
          onDragStart: () => "หยิบรายการแล้ว",
          onDragOver: ({ over }) => (over ? `ย้ายไปตำแหน่งที่ ${ids.indexOf(String(over.id)) + 1}` : ""),
          onDragEnd: ({ over }) => (over ? `วางที่ตำแหน่งที่ ${ids.indexOf(String(over.id)) + 1}` : "วางแล้ว"),
          onDragCancel: () => "ยกเลิกการย้าย",
        },
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className={className}>{items.map((it, i) => children(it, i))}</ul>
      </SortableContext>
    </DndContext>
  );
}

/** One row with a grip handle on the left. */
export function SortableItem({
  id,
  children,
  className,
  handleLabel = "ลากเพื่อย้าย",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  handleLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative flex items-center gap-2", isDragging && "z-10 opacity-90", className)}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={handleLabel}
        className={cn(
          "flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-[8px] text-text-2 hover:bg-hover hover:text-text active:cursor-grabbing",
          isDragging && "cursor-grabbing bg-hover text-text",
        )}
      >
        <GripVertical className="size-4" strokeWidth={1.75} />
      </button>
      {children}
    </li>
  );
}
