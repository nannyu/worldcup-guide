"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useEazo } from "@eazo/sdk/react";
import { request } from "@/lib/api/request";
import { isChineseLocale } from "@/lib/i18n/news-utils";

interface Comment {
  id: string;
  articleId: string;
  userId: string | null;
  parentId: string | null;
  content: string;
  authorName: string;
  authorAvatar: string;
  aiReply: string | null;
  aiReplyStatus: string | null;
  status: string;
  likeCount: number;
  createdAt: string;
  updatedAt: string;
}

interface CommentsProps {
  articleId: string;
  aiComment?: string;
  aiCommentZh?: string;
  locale: string;
}

interface CommentsResponse {
  ok: boolean;
  comments?: Comment[];
  count?: number;
  error?: string;
}

async function fetchComments(articleId: string, signal?: AbortSignal): Promise<CommentsResponse> {
  const res = await fetch(`/api/data/comments?articleId=${encodeURIComponent(articleId)}`, {
    cache: "no-store",
    signal,
  });
  return res.json() as Promise<CommentsResponse>;
}

function formatTime(dateStr: string, locale: string): string {
  const date = new Date(dateStr);
  if (!Number.isFinite(date.getTime())) return "";
  const isZh = locale.toLowerCase().startsWith("zh");
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return isZh ? "刚刚" : "just now";
  if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return isZh ? `${diffHr} 小时前` : `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;
}

export default function Comments({ articleId, aiComment, aiCommentZh, locale }: CommentsProps) {
  const currentUserId = useEazo((state) => state.auth.user?.id ?? null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [count, setCount] = useState(0);
  const [countLoaded, setCountLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isZh = isChineseLocale(locale);

  const loadComments = useCallback(async () => {
    try {
      const data = await fetchComments(articleId);
      if (data.ok) {
        setComments(data.comments || []);
        setCount(data.count || 0);
        setCountLoaded(true);
      }
    } catch {
      // silently fail
    }
  }, [articleId]);

  useEffect(() => {
    const controller = new AbortController();
    fetchComments(articleId, controller.signal)
      .then((data) => {
        if (data.ok) {
          setCount(data.count || 0);
          setCountLoaded(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setCountLoaded(true);
      });
    return () => controller.abort();
  }, [articleId]);

  const handleToggle = () => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadComments();
  };

  const handleSubmit = async () => {
    const content = inputValue.trim();
    if (!content || submitting) return;
    if (!currentUserId) {
      setError(isZh ? "请先登录后评论" : "Sign in to comment");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await request("/api/data/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, content }),
      });
      const data = await res.json() as CommentsResponse;
      if (res.ok && data.ok) {
        setInputValue("");
        await loadComments();
        window.setTimeout(() => void loadComments(), 3000);
      } else {
        setError(data.error || (isZh ? "评论发送失败" : "Failed to post comment"));
      }
    } catch {
      setError(isZh ? "评论发送失败" : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (deletingId) return;
    setDeletingId(commentId);
    setError(null);
    try {
      const res = await request(`/api/data/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      const data = await res.json() as CommentsResponse;
      if (res.ok && data.ok) {
        await loadComments();
      } else {
        setError(data.error || (isZh ? "删除失败" : "Failed to delete"));
      }
    } catch {
      setError(isZh ? "删除失败" : "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const aiDisplay = isZh ? (aiCommentZh || aiComment) : aiComment;
  const countLabel = countLoaded
    ? `${count} ${isZh ? "条评论" : count === 1 ? "comment" : "comments"}`
    : (isZh ? "评论" : "comments");

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-[11px] text-[#9E948C] hover:text-[#6D625A] transition-colors"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span>{countLabel}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2 border-t border-[#241A14]/10 pt-2">
              {/* AI Comment */}
              {aiDisplay && (
                <div className="border-l-2 border-[#C4A882] pl-2 py-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-[#C4A882] font-bold">
                    <span>🤖</span>
                    <span>{isZh ? "AI 编辑评论" : "AI Editor Comment"}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] italic text-[#8A8078] leading-relaxed">
                    &ldquo;{aiDisplay}&rdquo;
                  </p>
                </div>
              )}

              {/* Comment list */}
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2">
                  <div className="h-6 w-6 shrink-0 rounded-full bg-[#EDE9E0] border border-[#241A14]/20 flex items-center justify-center text-[10px] text-[#9E948C] font-bold overflow-hidden">
                    {comment.authorAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={comment.authorAvatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      (comment.authorName || "?")[0]
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[11px] font-bold text-[#241A14] truncate">
                        {comment.authorName || (isZh ? "匿名用户" : "Anonymous")}
                      </span>
                      <span className="text-[9px] text-[#9E948C]">
                        {formatTime(comment.createdAt, locale)}
                      </span>
                      {comment.userId === currentUserId && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(comment.id)}
                          disabled={deletingId === comment.id}
                          className="ml-auto text-[9px] text-[#B15C45] hover:text-[#8E3F2E] disabled:opacity-40"
                        >
                          {deletingId === comment.id ? "..." : isZh ? "删除" : "Delete"}
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-[#3C332D] leading-relaxed break-words">
                      {comment.content}
                    </p>
                    {comment.aiReply && (
                      <div className="mt-1 border-l-2 border-[#9CB48A] pl-2">
                        <div className="flex items-center gap-1 text-[9px] text-[#9CB48A] font-bold">
                          <span>🤖</span>
                          <span>{isZh ? "AI 回复" : "AI Reply"}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-[#6D625A] leading-relaxed">
                          {comment.aiReply}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {comments.length === 0 && !aiDisplay && (
                <p className="text-[10px] text-[#9E948C] text-center py-2">
                  {isZh ? "暂无评论，来说两句？" : "No comments yet. Be the first!"}
                </p>
              )}

              {error && (
                <p className="text-[10px] text-[#B15C45]">
                  {error}
                </p>
              )}

              {/* Input */}
              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  placeholder={isZh ? "发表评论..." : "Add a comment..."}
                  className="flex-1 min-w-0 rounded border border-[#241A14]/20 bg-[#FAF7F0] px-2 py-1.5 text-[11px] text-[#241A14] placeholder:text-[#9E948C] outline-none focus:border-[#C4A882] transition-colors"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || submitting}
                  className="shrink-0 rounded bg-[#241A14] px-3 py-1.5 text-[11px] font-bold text-[#FAF7F0] hover:bg-[#3C332D] disabled:opacity-40 transition-colors"
                >
                  {submitting ? "..." : isZh ? "发送" : "Send"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
