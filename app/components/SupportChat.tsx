"use client";

import { useState, useEffect, useRef } from "react";

type Message = {
  id: string;
  message: string;
  from_admin: boolean;
  created_at: string;
};

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  const [hidden, setHidden] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load messages on first open
  useEffect(() => {
    if (!open || loaded) return;
    fetchMessages();
  }, [open]);

  // Poll for new messages every 15s when open
  useEffect(() => {
    if (!open) return;
    const id = setInterval(fetchMessages, 15000);
    return () => clearInterval(id);
  }, [open, loaded]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  // Poll for unread count every 30s when closed
  useEffect(() => {
    if (open || hidden) return;
    const check = () => {
      fetch("/api/support/messages")
        .then((r) => r.json())
        .then((d) => {
          if (d.error) { setHidden(true); return; } // not logged in, hide widget
          const unreadCount = (d.messages ?? []).filter((m: Message) => m.from_admin).length;
          // We can't know read status from here, just show dot if any admin messages
          const hasAdminReplies = (d.messages ?? []).some((m: Message) => m.from_admin);
          setUnread(hasAdminReplies && !open ? 1 : 0);
        })
        .catch(() => setHidden(true));
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, [open, hidden]);

  async function fetchMessages() {
    const res = await fetch("/api/support/messages");
    const d = await res.json();
    if (d.error) { setHidden(true); return; }
    setMessages(d.messages ?? []);
    setLoaded(true);
    setUnread(0);
  }

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    const res = await fetch("/api/support/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });
    const d = await res.json();
    if (d.message) setMessages((prev) => [...prev, d.message]);
    setText("");
    setSending(false);
  }

  if (hidden) return null;

  return (
    <>
      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-[320px] flex-col rounded-2xl border border-line bg-panel shadow-2xl overflow-hidden"
          style={{ maxHeight: "70vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line bg-panelRaised px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold">Support</div>
              <div className="text-[10px] text-textDim">We typically reply within a few hours</div>
            </div>
            <button onClick={() => setOpen(false)} className="text-textDimmer hover:text-paper">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-2 p-4 min-h-[200px]">
            {!loaded && (
              <div className="flex items-center justify-center pt-8 text-xs text-textDim">Loading…</div>
            )}
            {loaded && messages.length === 0 && (
              <div className="rounded-xl border border-line bg-panelRaised p-3 text-[11.5px] text-textDim leading-relaxed">
                👋 Hi! Got a question or need help with Demand Pilot? Send us a message — we&apos;ll get back to you soon.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from_admin ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${m.from_admin ? "bg-panelRaised border border-line text-paper" : "bg-hazard text-[#161006]"}`}>
                  {m.message}
                  <div className={`mt-0.5 text-[9px] ${m.from_admin ? "text-textDimmer" : "text-[#161006]/60"}`}>
                    {m.from_admin ? "Support" : "You"} · {new Date(m.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-line p-3 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Type a message…"
              className="flex-1 rounded-xl border border-line bg-panelRaised px-3 py-2 text-[12px] text-paper placeholder:text-textDimmer focus:border-hazard focus:outline-none"
            />
            <button
              onClick={send}
              disabled={!text.trim() || sending}
              className="rounded-xl bg-hazard px-3 py-2 disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#161006" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => { setOpen((v) => !v); setUnread(0); }}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-hazard2 to-hazard shadow-lg transition-transform active:scale-95"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#161006" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#161006" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        )}
        {!open && unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 font-mono text-[9px] font-bold text-white">
            {unread}
          </span>
        )}
      </button>
    </>
  );
}
