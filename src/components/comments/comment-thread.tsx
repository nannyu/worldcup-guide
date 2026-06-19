"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageSquare, Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { tr } from "@/lib/i18n/content";

type CommentTargetType = "news" | "match" | "team";

interface PublicUser {
  id: string;
  email: string | null;
  name: string | null;
}

interface PublicComment {
  id: number;
  parentId: number | null;
  authorType: "user" | "ai";
  aiProvider: string | null;
  body: string;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

function getSessionUser(): Promise<PublicUser | null> {
  return fetch("/api/auth/session", { cache: "no-store" })
    .then((response) => response.json())
    .then((data) => data.user ?? null)
    .catch(() => null);
}

function formatCommentTime(input: string, locale: string): string {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale.startsWith("zh") ? "zh-CN" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function authorName(comment: PublicComment): string {
  if (comment.authorType === "ai") return comment.aiProvider || "AI 装杯评论员";
  return comment.author.name || comment.author.email || comment.author.id;
}

export function CommentThread({
  targetType,
  targetId,
  className = "",
}: {
  targetType: CommentTargetType;
  targetId: string;
  className?: string;
}) {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [posting, setPosting] = useState(false);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<PublicComment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = open && !loaded && !error;
  const repliesByParentId = useMemo(() => {
    const groups = new Map<number | null, PublicComment[]>();
    for (const comment of comments) {
      const key = comment.parentId ?? null;
      groups.set(key, [...(groups.get(key) || []), comment]);
    }
    return groups;
  }, [comments]);
  const rootComments = repliesByParentId.get(null) || [];

  useEffect(() => {
    if (!open || loaded) return;
    let alive = true;
    Promise.all([
      fetch(`/api/comments?${new URLSearchParams({ targetType, targetId })}`, { cache: "no-store" })
        .then((response) => response.json()),
      getSessionUser(),
    ])
      .then(([commentData, sessionUser]) => {
        if (!alive) return;
        setError(null);
        setComments(commentData.comments || []);
        setUser(sessionUser);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setError(tr(locale, "评论加载失败", "Failed to load comments"));
      });

    return () => {
      alive = false;
    };
  }, [loaded, locale, open, targetId, targetType]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setPosting(true);
    setError(null);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetType, targetId, body, parentId: replyTo?.id ?? null }),
    });
    const data = await response.json().catch(() => null);
    setPosting(false);

    if (!response.ok || !data?.ok) {
      setError(data?.error || tr(locale, "评论失败", "Comment failed"));
      if (response.status === 401) setUser(null);
      return;
    }

    setDraft("");
    setReplyTo(null);
    setComments((items) => [
      ...items,
      ...[data.comment, data.aiReply].filter(Boolean),
    ]);
  }

  function renderComment(comment: PublicComment, depth = 0) {
    const replies = repliesByParentId.get(comment.id) || [];
    const isAi = comment.authorType === "ai";
    return (
      <article
        key={comment.id}
        className={`border px-2.5 py-2 ${
          isAi
            ? "border-[#D36E52]/45 bg-[#FFF6EF]"
            : "border-[#241A14]/25 bg-[#F5F1E8]"
        }`}
      >
        <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
          <span className="min-w-0 truncate font-black text-[#241A14]">
            {authorName(comment)}
            {isAi && (
              <span className="ml-1 border border-[#D36E52] bg-[#D36E52] px-1 py-0.5 text-[8px] text-white">
                AI
              </span>
            )}
          </span>
          <span className="shrink-0 text-[#9E948C]">{formatCommentTime(comment.createdAt, locale)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-xs leading-5 text-[#5C524C]">{comment.body}</p>
        {user && (
          <button
            type="button"
            onClick={() => {
              setReplyTo(comment);
              setDraft("");
            }}
            className="mt-1 text-[10px] font-black text-[#D36E52] hover:underline"
          >
            {tr(locale, "回复", "Reply")}
          </button>
        )}
        {replies.length > 0 && (
          <div className={`mt-2 space-y-2 ${depth < 2 ? "ml-3 border-l border-dashed border-[#241A14]/20 pl-2" : ""}`}>
            {replies.map((reply) => renderComment(reply, depth + 1))}
          </div>
        )}
      </article>
    );
  }

  return (
    <section
      className={`mt-3 border-t border-dashed border-[#241A14]/30 pt-2 ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          if (!open) setError(null);
          setOpen((value) => !value);
        }}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-black text-[#241A14]"
      >
        <span className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5 text-[#D36E52]" />
          {tr(locale, "评论区", "Comments")}
        </span>
        <span className="text-[10px] font-bold text-[#9E948C]">
          {loaded ? `${comments.length} ${tr(locale, "条", "items")}` : open ? tr(locale, "收起", "Collapse") : tr(locale, "展开", "Open")}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {loading ? (
            <div className="border border-dashed border-[#241A14]/25 bg-[#EDE9E0] px-2.5 py-2 text-xs text-[#9E948C]">
              {tr(locale, "评论加载中…", "Loading comments...")}
            </div>
          ) : comments.length > 0 ? (
            <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {rootComments.map((comment) => renderComment(comment))}
            </div>
          ) : (
            <div className="border border-dashed border-[#241A14]/25 bg-[#EDE9E0] px-2.5 py-2 text-xs text-[#9E948C]">
              {tr(locale, "还没有评论，来抢第一条。", "No comments yet. Start the thread.")}
            </div>
          )}

          {user ? (
            <form className="space-y-2" onSubmit={submit}>
              {replyTo && (
                <div className="flex items-center justify-between gap-2 border border-[#241A14]/25 bg-[#EDE9E0] px-2.5 py-1.5 text-[10px] text-[#5C524C]">
                  <span className="min-w-0 truncate">
                    {tr(locale, "回复", "Replying to")}：{authorName(replyTo)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyTo(null)}
                    className="shrink-0 font-black text-[#D36E52]"
                  >
                    {tr(locale, "取消", "Cancel")}
                  </button>
                </div>
              )}
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 500))}
                placeholder={replyTo ? tr(locale, "写下你的回复…", "Write your reply...") : tr(locale, "写下你的看法…", "Write your take...")}
                className="min-h-16 w-full resize-none border border-[#241A14] bg-[#FAF7F0] px-2.5 py-2 text-xs text-[#241A14] outline-none placeholder:text-[#9E948C] focus:border-[#D36E52]"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold text-[#9E948C]">{draft.length}/500</span>
                <button
                  type="submit"
                  disabled={posting || draft.trim().length === 0}
                  className="inline-flex items-center gap-1 border border-[#241A14] bg-[#241A14] px-2.5 py-1 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-3 w-3" />
                  {posting ? tr(locale, "发送中", "Sending") : replyTo ? tr(locale, "发表回复", "Reply") : tr(locale, "发表评论", "Post")}
                </button>
              </div>
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2 border border-[#241A14]/25 bg-[#EDE9E0] px-2.5 py-2 text-xs text-[#5C524C]">
              <span>{tr(locale, "登录后可以评论。", "Sign in to comment.")}</span>
              <Link href="/account" className="shrink-0 font-black text-[#D36E52] hover:underline">
                {tr(locale, "登录/注册", "Sign in")}
              </Link>
            </div>
          )}

          {error && <p className="text-xs font-bold text-[#D36E52]">{error}</p>}
        </div>
      )}
    </section>
  );
}
