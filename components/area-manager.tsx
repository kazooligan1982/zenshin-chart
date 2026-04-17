"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Settings, Trash2, Edit2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Area } from "@/types/chart";

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

interface AreaManagerProps {
  areas: Area[];
  chartId: string;
  onUpdateArea: (areaId: string, updates: Partial<Pick<Area, "name" | "color">>) => Promise<void>;
  onDeleteArea: (areaId: string) => Promise<void>;
  onCreateArea: (name: string, color: string) => Promise<Area | null>;
}

export function AreaManager({
  areas,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  chartId: _chartId,
  onUpdateArea,
  onDeleteArea,
  onCreateArea,
}: AreaManagerProps) {
  const tTags = useTranslations("tags");
  const [open, setOpen] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [newAreaColor, setNewAreaColor] = useState(PRESET_COLORS[0].value);
  const [isSaving, setIsSaving] = useState(false);

  const handleStartEdit = (area: Area) => {
    setEditingAreaId(area.id);
    setEditName(area.name);
    setEditColor(area.color);
  };

  const handleCancelEdit = () => {
    setEditingAreaId(null);
    setEditName("");
    setEditColor("");
  };

  const handleSaveEdit = async () => {
    if (!editingAreaId || !editName.trim()) return;

    setIsSaving(true);
    try {
      await onUpdateArea(editingAreaId, {
        name: editName.trim(),
        color: editColor,
      });
      handleCancelEdit();
    } catch (error) {
      console.error("[AreaManager] 更新エラー:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!newAreaName.trim()) return;

    setIsSaving(true);
    try {
      const newArea = await onCreateArea(newAreaName.trim(), newAreaColor);
      if (newArea) {
        setNewAreaName("");
        setNewAreaColor(PRESET_COLORS[0].value);
      }
    } catch (error) {
      console.error("[AreaManager] 作成エラー:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-2 text-sm text-gray-600">
          <Settings className="w-4 h-4" />
          {tTags("tagSettings")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>タグ管理</DialogTitle>
          <DialogDescription>
            タグの作成、編集、削除ができます。タグを削除すると、そのタグが付いているアイテムは「未分類」に戻ります。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* 新規作成セクション */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="font-medium text-sm">新規タグ作成</div>
            <div className="space-y-2">
              <Input
                placeholder="タグ名を入力"
                value={newAreaName}
                onChange={(e) => setNewAreaName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
              />
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">色を選択</div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      className={cn(
                        "w-8 h-8 rounded-full border-2 transition-all",
                        newAreaColor === color.value
                          ? "border-gray-900 scale-110"
                          : "border-gray-300 hover:border-gray-500"
                      )}
                      style={{ backgroundColor: color.value }}
                      onClick={() => setNewAreaColor(color.value)}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
              <Button
                onClick={handleCreate}
                disabled={!newAreaName.trim() || isSaving}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                タグを作成
              </Button>
            </div>
          </div>

          {/* 既存タグリスト */}
          <div className="space-y-2">
            <div className="font-medium text-sm">既存のタグ</div>
            {areas.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                タグがありません
              </div>
            ) : (
              <div className="space-y-2">
                {areas.map((area) => (
                  <div
                    key={area.id}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    {editingAreaId === area.id ? (
                      <>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="flex-1"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          {PRESET_COLORS.map((color) => (
                            <button
                              key={color.value}
                              type="button"
                              className={cn(
                                "w-6 h-6 rounded-full border-2 transition-all",
                                editColor === color.value
                                  ? "border-gray-900 scale-110"
                                  : "border-gray-300 hover:border-gray-500"
                              )}
                              style={{ backgroundColor: color.value }}
                              onClick={() => setEditColor(color.value)}
                              title={color.name}
                            />
                          ))}
                        </div>
                        <Button
                          size="sm"
                          onClick={handleSaveEdit}
                          disabled={!editName.trim() || isSaving}
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                        >
                          キャンセル
                        </Button>
                      </>
                    ) : (
                      <>
                        <Badge
                          variant="outline"
                          className="flex-1 justify-start"
                          style={{
                            backgroundColor: `${area.color}20`,
                            borderColor: area.color,
                            color: area.color,
                          }}
                        >
                          {area.name}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleStartEdit(area)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="text-destructive">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>タグを削除しますか？</AlertDialogTitle>
                              <AlertDialogDescription>
                                このタグ「{area.name}」を削除すると、このタグが付いているすべてのアイテムは「未分類」に戻ります。
                                この操作は取り消せません。
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>キャンセル</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={async () => {
                                  await onDeleteArea(area.id);
                                }}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                削除
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

