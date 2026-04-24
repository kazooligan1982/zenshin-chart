"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Area } from "@/types/chart";
import { logger } from "@/lib/logger";

// プリセットカラー
const PRESET_COLORS = [
  { name: "青", value: "#3b82f6" },
  { name: "緑", value: "#10b981" },
  { name: "赤", value: "#ef4444" },
  { name: "黄", value: "#f59e0b" },
  { name: "紫", value: "#8b5cf6" },
  { name: "ピンク", value: "#ec4899" },
  { name: "グレー", value: "#6b7280" },
  { name: "オレンジ", value: "#f97316" },
  { name: "シアン", value: "#06b6d4" },
  { name: "ライム", value: "#84cc16" },
];

interface AreaTagEditorProps {
  currentAreaId: string | null;
  areas: Area[];
  chartId: string;
  onAreaChange: (areaId: string | null) => void;
  onCreateArea: (name: string, color: string) => Promise<Area | null>;
  size?: "sm" | "md";
}

export function AreaTagEditor({
  currentAreaId,
  areas,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chartId: _chartId,
  onAreaChange,
  onCreateArea,
  size = "sm",
}: AreaTagEditorProps) {
  const tTags = useTranslations("tags");
  const [open, setOpen] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0].value);
  const [isCreating, setIsCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_showColorPicker, setShowColorPicker] = useState(false);

  const currentArea = currentAreaId
    ? areas.find((a) => a.id === currentAreaId)
    : null;

  const handleCreateArea = async () => {
    if (!newAreaName.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const newArea = await onCreateArea(newAreaName.trim(), selectedColor);
      if (newArea) {
        onAreaChange(newArea.id);
        setNewAreaName("");
        setSelectedColor(PRESET_COLORS[0].value);
        setShowColorPicker(false);
        setOpen(false);
      }
    } catch (error) {
      logger.error("[AreaTagEditor] エリア作成エラー:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleCreateArea();
    }
    if (e.key === "Escape") {
      setNewAreaName("");
      setOpen(false);
    }
  };

  const badgeSize =
    size === "sm"
      ? "text-[10px] h-6 px-2 inline-flex items-center"
      : "text-xs h-6 px-2 inline-flex items-center";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {currentArea ? (
          <Badge
            variant="outline"
            className={cn(
              badgeSize,
              "shrink-0 leading-none cursor-pointer hover:opacity-80 transition-opacity"
            )}
            style={{
              minHeight: "1.5rem",
              backgroundColor: `${currentArea.color}20`,
              borderColor: currentArea.color,
              color: currentArea.color,
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {currentArea.name}
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className={cn(
              badgeSize,
              "shrink-0 leading-none cursor-pointer hover:bg-muted transition-colors text-muted-foreground"
            )}
            style={{ minHeight: "1.5rem" }}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Plus className="w-3 h-3 mr-1" />
            {tTags("addTag")}
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <Command>
          <CommandInput
            placeholder={tTags("searchOrCreate")}
            value={newAreaName}
            onValueChange={setNewAreaName}
            onKeyDown={handleKeyDown}
          />
          <CommandList>
            <CommandEmpty>
              {newAreaName.trim() ? (
                <div className="py-2 px-3">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm h-8"
                    onClick={handleCreateArea}
                    disabled={isCreating}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {tTags("createTagWithName", { name: newAreaName })}
                  </Button>
                </div>
              ) : (
                <div className="py-2 px-3 text-sm text-muted-foreground">
                  {tTags("noTagsFound")}
                </div>
              )}
            </CommandEmpty>
            <CommandGroup>
              {/* 未分類オプション */}
              <CommandItem
                onSelect={() => {
                  onAreaChange(null);
                  setOpen(false);
                }}
                className="flex items-center justify-between"
              >
                <span className="text-muted-foreground">{tTags("untagged")}</span>
                {!currentAreaId && <Check className="w-4 h-4" />}
              </CommandItem>
              {/* 既存のエリア */}
              {areas.map((area) => (
                <CommandItem
                  key={area.id}
                  onSelect={() => {
                    onAreaChange(area.id === currentAreaId ? null : area.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: area.color }}
                    />
                    <span>{area.name}</span>
                  </div>
                  {area.id === currentAreaId && <Check className="w-4 h-4" />}
                </CommandItem>
              ))}
            </CommandGroup>
            {/* 新規作成セクション */}
            {newAreaName.trim() && (
              <CommandGroup>
                <div className="border-t p-2 space-y-2">
                  {/* 色選択 */}
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground px-1">{tTags("selectColor")}</div>
                    <div className="flex flex-wrap gap-1">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color.value}
                          type="button"
                          className={cn(
                            "w-6 h-6 rounded-full border-2 transition-all",
                            selectedColor === color.value
                              ? "border-gray-900 scale-110"
                              : "border-gray-300 hover:border-gray-500"
                          )}
                          style={{ backgroundColor: color.value }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedColor(color.value);
                          }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm h-8"
                    onClick={handleCreateArea}
                    disabled={isCreating}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {tTags("createTagWithName", { name: newAreaName })}
                    {isCreating && "..."}
                  </Button>
                </div>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

