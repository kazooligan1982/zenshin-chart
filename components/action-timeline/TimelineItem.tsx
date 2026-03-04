"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ja, enUS } from "date-fns/locale"
import { useLocale } from "next-intl"
import { MoreVertical, Edit2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  updateComment,
  deleteComment,
  updateVisionComment,
  deleteVisionComment,
  updateRealityComment,
  deleteRealityComment,
} from "@/app/charts/[id]/actions"
import { linkifyUrls } from "@/lib/utils"
import type { TimelineComment } from "@/types/database"

interface TimelineItemProps {
  comment: TimelineComment
  currentUserId: string
  chartId: string
  workspaceId?: string
  type: "action" | "vision" | "reality"
  onDelete?: (commentId: string) => void
  onDeleted?: (commentId: string) => void
  onDataRefresh?: () => void
  onUndo?: (commentId: string) => void
  onUpdated?: (commentId: string, newContent: string) => void
}

export function TimelineItem({
  comment,
  currentUserId,
  chartId,
  workspaceId,
  type,
  onDelete,
  onDeleted,
  onDataRefresh,
  onUndo,
  onUpdated,
}: TimelineItemProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations("timeline")
  const tCommon = useTranslations("common")
  const tToast = useTranslations("toast")
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [isLoading, setIsLoading] = useState(false)
  // TODO: 認証実装後に currentUserId 比較に戻す
  const isOwn = !currentUserId || comment.user_id === currentUserId
  const dateLocale = locale === "ja" ? ja : enUS
  const relativeTime = formatDistanceToNow(new Date(comment.created_at), {
    addSuffix: true,
    locale: dateLocale,
  })
  const userName = comment.profile?.name || comment.profile?.email || "Unknown"
  const userInitial = userName[0]?.toUpperCase() || "?"
  const avatarUrl = comment.profile?.avatar_url || null

  const handleUpdate = async () => {
    if (!editContent.trim() || editContent === comment.content) {
      setIsEditing(false)
      return
    }
    setIsLoading(true)
    const nextContent = editContent.trim()
    onUpdated?.(comment.id, nextContent)
    setIsEditing(false)
    let result
    switch (type) {
      case "vision":
        result = await updateVisionComment(comment.id, nextContent, chartId)
        break
      case "reality":
        result = await updateRealityComment(comment.id, nextContent, chartId)
        break
      case "action":
      default:
        result = await updateComment(comment.id, nextContent, chartId)
    }
    setIsLoading(false)
    if (result.success) {
      router.refresh()
    } else {
      onUpdated?.(comment.id, comment.content)
      setEditContent(comment.content)
      toast.error(tToast("updateFailed"), { duration: 5000 })
    }
  }

  const handleDelete = () => {
    onDelete?.(comment.id)

    let undone = false
    let deleteExecuted = false
    const runDelete = async () => {
      if (undone || deleteExecuted) return
      deleteExecuted = true
      let result
      switch (type) {
        case "vision":
          result = await deleteVisionComment(comment.id, chartId)
          break
        case "reality":
          result = await deleteRealityComment(comment.id, chartId)
          break
        case "action":
        default:
          result = await deleteComment(comment.id, chartId)
      }

      if (!result.success) {
        onUndo?.(comment.id)
        toast.error(tToast("deleteFailed"), { duration: 5000 })
        return
      }
      onDeleted?.(comment.id)
      onDataRefresh?.()
      router.refresh()
    }

    toast.dismiss();
    toast(t("commentDeleted"), {
      id: `comment-delete-${comment.id}`,
      duration: 15000,
      action: {
        label: t("restore"),
        onClick: () => {
          undone = true
          onUndo?.(comment.id)
        },
      },
      onDismiss: () => {
        void runDelete()
      },
      onAutoClose: () => {
        void runDelete()
      },
    })
  }

  return (
    <div className="flex gap-3">
      <div className="shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={userName}
            className="w-8 h-8 rounded-full object-cover"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-zenshin-teal flex items-center justify-center text-sm font-semibold text-white">
            {userInitial}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold text-sm text-zenshin-navy">{userName}</span>
          <span className="text-xs text-gray-400">{relativeTime}</span>
          {comment.updated_at !== comment.created_at && (
            <span className="text-xs text-gray-400">{t("edited")}</span>
          )}
        </div>
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full p-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              disabled={isLoading}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleUpdate}
                disabled={isLoading}
                className="px-3 py-1 bg-zenshin-teal text-white text-sm rounded hover:bg-zenshin-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? t("saving") : tCommon("save")}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditContent(comment.content)
                }}
                disabled={isLoading}
                className="px-3 py-1 bg-zenshin-navy/10 text-sm rounded hover:bg-zenshin-navy/15 disabled:opacity-50 transition-colors"
              >
                {tCommon("cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-sm text-gray-700 prose prose-sm max-w-none tiptap [&_.mention]:bg-blue-100 [&_.mention]:text-blue-700 [&_.mention]:px-1 [&_.mention]:py-0.5 [&_.mention]:rounded [&_.mention]:text-xs [&_.mention]:font-medium [&_.mention]:cursor-pointer [&_.mention]:no-underline [&_a]:text-blue-500 [&_a]:underline [&_a]:hover:text-blue-700 [&_a]:cursor-pointer"
            dangerouslySetInnerHTML={{
              __html: comment.content.trimStart().startsWith("<")
                ? comment.content
                : linkifyUrls(comment.content),
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              const mention = target.closest(".mention") as HTMLElement;
              if (mention) {
                const mentionId = mention.getAttribute("data-id");
                if (mentionId) {
                  const [mentionType, targetChartId] = mentionId.split(":");
                  if (targetChartId) {
                    const chartPath = workspaceId
                      ? `/workspaces/${workspaceId}/charts/${targetChartId}`
                      : `/charts/${targetChartId}`;
                    router.push(chartPath);
                  }
                }
              }
            }}
          />
        )}
      </div>
      {isOwn && !isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 p-1 hover:bg-zenshin-navy/5 rounded transition-colors"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <MoreVertical className="h-4 w-4 text-gray-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent
              align="end"
              sideOffset={5}
              className="z-[9999] bg-white shadow-lg border min-w-[120px]"
            >
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  setIsEditing(true)
                }}
                className="cursor-pointer"
              >
              <Edit2 className="h-4 w-4 mr-2" />
              {tCommon("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  handleDelete()
                }}
                className="text-red-600 focus:text-red-600 cursor-pointer"
              >
              <Trash2 className="h-4 w-4 mr-2" />
              {tCommon("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenu>
      )}
    </div>
  )
}
