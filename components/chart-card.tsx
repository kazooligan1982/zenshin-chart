"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import Link from "next/link";
import { Lock, LockOpen, Trash2, Calendar, Clock } from "lucide-react";
import { format } from "date-fns";
import { deleteChart } from "@/app/actions";
import { removeChartFromRecent } from "@/lib/recent-charts";
import { useTransition, useState } from "react";
import { useLongPress } from "@/hooks/use-long-press";
import { cn } from "@/lib/utils";

interface ChartData {
  id: string;
  title: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  areas?: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

interface ChartCardProps {
  chart: ChartData;
}

export function ChartCard({ chart }: ChartCardProps) {
  const [isPending, startTransition] = useTransition();
  const [isLocked, setIsLocked] = useState(false);

  // 日付フォーマッター (yyyy/mm/dd)
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    try {
      return format(new Date(dateStr), "yyyy/MM/dd");
    } catch {
      return "-";
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await deleteChart(chart.id);
      removeChartFromRecent(chart.id);
    });
  };

  const handleLockToggle = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLocked((prev) => !prev);
  };

  const { isPressing, ...longPressHandlers } = useLongPress({
    onLongPress: handleLockToggle,
    delay: 500,
  });

  return (
    <div className="group relative">
      <Card className="hover:shadow-md transition-all h-full relative">
        <Link 
          href={`/charts/${chart.id}`} 
          className="block cursor-pointer"
          onClick={(e) => {
            // ボタン部分のクリックを除外
            const target = e.target as HTMLElement;
            const actionButton = target.closest('[data-action-button]');
            const actionContainer = target.closest('[data-action-container]');
            if (actionButton || actionContainer) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          }}
          onMouseDown={(e) => {
            // ボタン部分のmousedownを除外
            const target = e.target as HTMLElement;
            const actionButton = target.closest('[data-action-button]');
            const actionContainer = target.closest('[data-action-container]');
            if (actionButton || actionContainer) {
              e.preventDefault();
              e.stopPropagation();
              return false;
            }
          }}
        >
          <CardHeader>
            <CardTitle className="text-lg font-bold line-clamp-2">
              {chart.title || "無題のチャート"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            {/* 完了予定日 */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>完了予定日:</span>
              </span>
              <span className="font-medium">{formatDate(chart.due_date)}</span>
            </div>

            {/* 作成日 */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>作成日:</span>
              </span>
              <span className="font-medium">{formatDate(chart.created_at)}</span>
            </div>

            {/* 更新日 */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>更新日:</span>
              </span>
              <span className="font-medium">{formatDate(chart.updated_at)}</span>
            </div>
          </CardContent>
        </Link>

        {/* ホバーアクション (絶対配置で右上に) */}
        <div 
          className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-[100]"
          data-action-container
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* 鍵アイコン (長押しでロック/アンロック) */}
          <div className="relative z-[101]">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 relative z-[102] transition-all",
                isLocked
                  ? "text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                  : "text-gray-600 hover:text-gray-700 hover:bg-gray-50",
                isPressing ? "scale-95 bg-gray-100 dark:bg-gray-800" : ""
              )}
              data-action-button
              {...longPressHandlers}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {isLocked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <LockOpen className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* 削除ボタン */}
          <div className="relative z-[101]">
            {!isLocked ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 relative z-[102]"
                    data-action-button
                    onClick={(e) => {
                      // Linkへのイベント伝播を止める
                      e.stopPropagation();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>チャートを削除しますか？</AlertDialogTitle>
                    <AlertDialogDescription>
                      この操作は取り消せません。本当に削除してもよろしいですか？
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
                      No
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(e);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground/50 cursor-not-allowed relative z-[102]"
                data-action-button
                disabled
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

