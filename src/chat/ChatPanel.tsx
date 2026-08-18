import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Copy, FileDown, HelpCircle, Loader2, Menu, PanelRightClose, Pencil, Plus, RotateCw, Send, X } from 'lucide-react';
import { API_BASE } from './config';
import MarkdownView from './MarkdownView';
import { getBookState } from './bookState';

// 채팅 답변을 DOCX 로 내려받는다(백엔드 /export/docx, 인증 포함 blob).
async function downloadAnswerDocx(content: string) {
  const res = await fetch(`${API_BASE}/export/docx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: '챗봇 답변', content }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ebook_html-답변.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface ChatScreenContext {
  page?: string;
  selected_project_id?: string | null;
}

// 계획 v3 §5 — ui_action 타입 계약. 미등록 type 은 서버가 만들지 않고, 프런트는 무시한다.
export interface ChatUiAction {
  type: string;
  payload?: Record<string, unknown>;
  requires_confirm?: boolean;
  auto_apply?: boolean;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // 2026-05-27 — 현재 화면 문맥(계획 v2 §3). 채팅엔진의 대상 추론·grounding 에 사용(서버에서 재검증).
  screenContext?: ChatScreenContext;
  // 계획 v3 §5 — auto_apply ui_action 을 실제 화면 전환에 반영(확인 필요/미등록은 호출 안 됨).
  onUiAction?: (action: ChatUiAction) => void;
}

interface Message {
  role: 'assistant' | 'user';
  text: string;
  kind?: string;             // ChatAnswer.answer_kind
  status?: string;           // ChatAnswer.status
  suggestions?: string[];
  pendingActionId?: string;  // status=confirm_required 일 때 '확인' 버튼이 echo (계획 v3 §4)
  actionTrace?: { label: string; undoable: boolean };  // 실행 투명성(무엇을 했는지) + 되돌리기
  ts?: number;  // 표시 시각(epoch ms) — 브라우저 로컬 시간
  undone?: boolean;  // 되돌리기/다시실행 토글 상태
}

interface ConvSummary {
  id: string;
  title: string;
  preview: string;
  updated_at: number;
  count: number;
}

interface SendOpts {
  confirm?: boolean;          // 확인/취소 명시 전달
  confirmActionId?: string;
}

interface ChatAnswerPayload {
  answer?: string;
  answer_kind?: string;
  status?: string;
  session_id?: string;
  suggested_questions?: string[];
  pending_action_id?: string;
  ui_action?: ChatUiAction;
  action_trace?: { label: string; undoable: boolean };
}

function makeInitialMessages(): Message[] {
  return [{
    role: 'assistant',
    text: '안녕하세요! **EVER-SKETCH 챗봇**이에요. 카드로 이북을 만들고, 자유 캔버스로 그림을 그리고, 발표까지 할 수 있어요. 무엇을 도와드릴까요?',
    suggestions: ['이북 어떻게 만들어?', '카드가 뭐야?', '발표 모드는 어떻게 써?'],
  }];
}

function _dayKey(ts?: number): string { if (!ts) return ''; const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
function _fmtTime(ts: number): string { const d = new Date(ts); let h = d.getHours(); const m = d.getMinutes(); const ap = h < 12 ? '오전' : '오후'; h = h % 12 || 12; return `${ap} ${h}:${String(m).padStart(2, '0')}`; }
function _fmtDay(ts: number): string {
  const d = new Date(ts); const now = new Date();
  const same = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return '오늘';
  if (same(d, new Date(now.getTime() - 86400000))) return '어제';
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
function relTime(sec: number): string {
  if (!sec) return '';
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  const dt = new Date(sec * 1000);
  return `${dt.getMonth() + 1}월 ${dt.getDate()}일`;
}

const EXAMPLE_PROMPTS: string[] = ['사각형 3개 넣어줘', '세모 하나 그려줘', '표지 카드 추가', '다크 배경으로 바꿔줘', '로드맵 만들어줘', '발표 시작'];

// 질문 가이드 — 일반 질문 + 현재 화면(screen_context.page) 맞춤 질문.
// page 값은 App 의 VIEW_TO_PAGE 및 ProjectDetailPage 와 정합한다.
const GENERAL_GUIDE: string[] = [
  '이북 어떻게 만들어?',
  '카드가 뭐야?',
  '발표 모드는 어떻게 써?',
  '자유 캔버스로 화살표 그리는 법',
  '단축키 알려줘',
];

const SCREEN_GUIDE: Record<string, { label: string; questions: string[] }> = {
  builder: { label: '스케치 빌더', questions: ['표지 카드부터 추가하려면?', '내용은 어디서 채워?', '이북 만들기 누르면 어떻게 돼?'] },
};

const MIN_WIDTH = 340;
const MAX_WIDTH = 820;
const DEFAULT_WIDTH = 430;

// L/M/S 사이즈 프리셋 — 사용자가 헤더의 아이콘 버튼으로 전환.
const SIZE_PRESETS = { S: 340, M: 460, L: 640 } as const;
type ChatSize = keyof typeof SIZE_PRESETS;
const SIZE_KEY = 'agentic-pm-chat-size';
const SESSION_KEY = 'agentic-pm-chat-session';

const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, screenContext, onUiAction }) => {
  const [size, setSize] = useState<ChatSize>(() => {
    try {
      const v = localStorage.getItem(SIZE_KEY);
      if (v === 'S' || v === 'M' || v === 'L') return v;
    } catch { /* noop */ }
    return 'M';
  });
  const [width, setWidth] = useState<number>(SIZE_PRESETS[size] ?? DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const pickSize = (s: ChatSize) => {
    setSize(s);
    setWidth(SIZE_PRESETS[s]);
    try { localStorage.setItem(SIZE_KEY, s); } catch { /* noop */ }
  };
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const [view, setView] = useState<'chat' | 'list'>('chat');
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [messages, setMessages] = useState<Message[]>(makeInitialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [docxBusyIdx, setDocxBusyIdx] = useState<number | null>(null);

  const copyAnswer = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      /* clipboard 미지원 시 무시 */
    }
  };

  const exportDocx = async (text: string, idx: number) => {
    setDocxBusyIdx(idx);
    try {
      await downloadAnswerDocx(text);
    } catch {
      /* 실패 무시(버튼 상태만 복구) */
    } finally {
      setDocxBusyIdx((cur) => (cur === idx ? null : cur));
    }
  };

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isResizing) return;
    const next = window.innerWidth - event.clientX;
    if (next >= MIN_WIDTH && next <= MAX_WIDTH) setWidth(next);
  }, [isResizing]);

  const stopResize = useCallback(() => setIsResizing(false), []);

  useEffect(() => {
    if (!isResizing) return;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
      document.body.style.cursor = 'default';
      document.body.style.userSelect = 'auto';
    };
  }, [handleMouseMove, isResizing, stopResize]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  // 새로고침 후 이어가기: 저장된 sessionId가 있으면 그 대화 기록을 한 번 복원.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const sid = sessionId;
    if (!sid) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/chat/conversations/${sid}`);
        if (!res.ok) return;
        const data = await res.json();
        const msgs: Message[] = (data.messages || []).map((m: { role: string; text: string; ts?: number }) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text, ts: m.ts ? m.ts * 1000 : undefined }));
        if (msgs.length) setMessages(msgs);
      } catch { /* best-effort */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ChatAnswer(meta) 를 마지막 assistant 말풍선에 반영.
  const applyMeta = (payload: ChatAnswerPayload) => {
    if (payload.session_id) {
      setSessionId(payload.session_id);
      try { localStorage.setItem(SESSION_KEY, payload.session_id); } catch { /* noop */ }
    }
    if (payload.ui_action?.auto_apply && onUiAction) onUiAction(payload.ui_action);
  };

  // 새 대화: 대화 기록 + 서버 세션 기억만 초기화(캔버스는 그대로).
  const newChat = async () => {
    if (busy) return;
    try {
      await fetch(`${API_BASE}/chat/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId }) });
    } catch { /* best-effort */ }
    setSessionId(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
    setMessages(makeInitialMessages());
    setDraft('');
  };

  const regenerate = (idx: number) => {
    if (busy) return;
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { void send(messages[i].text); return; }
    }
  };

  const loadConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* ignore */ }
  };

  const openConversation = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/chat/conversations/${id}`);
      const data = await res.json();
      const msgs: Message[] = (data.messages || []).map((m: { role: string; text: string; ts?: number }) => ({ role: m.role === 'user' ? 'user' : 'assistant', text: m.text, ts: m.ts ? m.ts * 1000 : undefined }));
      setMessages(msgs.length ? msgs : makeInitialMessages());
      setSessionId(id);
      try { localStorage.setItem(SESSION_KEY, id); } catch { /* noop */ }
      setView('chat');
    } catch { /* ignore */ }
  };

  const send = async (forced?: string, opts?: SendOpts) => {
    const text = (forced ?? draft).trim();
    if (!text || busy) return;
    setDraft('');
    setMessages((prev) => [...prev, { role: 'user', text, ts: Date.now() }]);
    setBusy(true);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({
      message: text,
      session_id: sessionId,
      confirm: opts?.confirm,
      confirm_action_id: opts?.confirmActionId,
      // G1 문서 컨텍스트 계약 — 매 턴 현재 이북 스냅샷 동봉(서버가 세션에 보관).
      book_state: getBookState(),
      screen_context: {
        page: screenContext?.page,
        selected_project_id: screenContext?.selected_project_id ?? null,
      },
    });

    let streamStarted = false;
    try {
      // 계획 v3 §7 — 스트리밍(SSE) 우선. 실패하면 비스트리밍 /chat/v2 로 폴백.
      const streamed = await sendStreaming(headers, body, () => { streamStarted = true; });
      if (!streamed) await sendOnce(headers, body);
    } catch {
      if (!streamStarted) {
        try {
          await sendOnce(headers, body);
        } catch (e) {
          setMessages((prev) => [...prev, { role: 'assistant', text: `요청 처리에 실패했습니다. ${e}`, status: 'error' }]);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // 비스트리밍 단발 요청(폴백 + 확인/추천 클릭 경로).
  const sendOnce = async (headers: Record<string, string>, body: string) => {
    const res = await fetch(`${API_BASE}/chat/v2`, { method: 'POST', headers, body });
    const payload: ChatAnswerPayload = await res.json();
    if (!res.ok) throw new Error((payload as { detail?: string }).detail || res.statusText);
    applyMeta(payload);
    setMessages((prev) => [...prev, {
      role: 'assistant',
      text: payload.answer || '(빈 응답)',
      kind: payload.answer_kind,
      status: payload.status,
      suggestions: payload.suggested_questions || [],
      pendingActionId: payload.pending_action_id || undefined,
      actionTrace: payload.action_trace,
      ts: Date.now(),
    }]);
  };

  // SSE 스트리밍: meta → token* → done. 성공적으로 시작했으면 true.
  const sendStreaming = async (headers: Record<string, string>, body: string, onStarted?: () => void): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/chat/v2/stream`, { method: 'POST', headers, body });
    if (!res.ok || !res.body) return false;

    // 진행 중 말풍선을 하나 추가하고, 이 인덱스를 token 마다 갱신.
    let placeholderAdded = false;
    const appendToLast = (chunk: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === 'assistant') next[next.length - 1] = { ...last, text: last.text + chunk };
        return next;
      });
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const block of events) {
        const evMatch = block.match(/event: (\w+)/);
        const dataMatch = block.match(/data: (.*)$/s);
        if (!evMatch || !dataMatch) continue;
        const data = JSON.parse(dataMatch[1]);
        if (evMatch[1] === 'meta') {
          applyMeta(data);
          setMessages((prev) => [...prev, {
            role: 'assistant',
            text: '',
            kind: data.answer_kind,
            status: data.status,
            suggestions: data.suggested_questions || [],
            pendingActionId: data.pending_action_id || undefined,
            actionTrace: data.action_trace,
            ts: Date.now(),
          }]);
          placeholderAdded = true;
          onStarted?.();
        } else if (evMatch[1] === 'token' && placeholderAdded) {
          appendToLast(data.t || '');
        }
      }
    }
    return placeholderAdded;
  };

  const noUserMsgs = messages.filter((m) => m.role === 'user').length === 0;

  return (
    <aside
      className={`chat-panel ${isOpen ? 'open' : ''}`}
      style={{ width }}
    >
      <button
        className="chat-resizer"
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
        aria-label="채팅 패널 너비 조절"
      />

      {view === 'list' ? (
        <>
          <header>
            <div><strong>내 대화</strong></div>
            <div className="chat-header-actions">
              <button onClick={onClose} title="닫기"><X className="h-5 w-5" /></button>
            </div>
          </header>
          <div className="chat-conv-list">
            <button type="button" className="chat-conv-new" onClick={() => { void newChat(); setView('chat'); }}>
              <Plus className="h-4 w-4" /> 새 메시지 보내기
            </button>
            {conversations.length === 0 ? (
              <div className="chat-conv-empty">아직 저장된 대화가 없어요.</div>
            ) : (
              conversations.map((c) => (
                <button key={c.id} type="button" className="chat-conv-item" onClick={() => void openConversation(c.id)}>
                  <img src="/favicon.svg" alt="" width={30} height={30} style={{ borderRadius: 8, flex: '0 0 auto' }} />
                  <div className="chat-conv-meta">
                    <div className="chat-conv-title">{c.title}</div>
                    <div className="chat-conv-time">{relTime(c.updated_at)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 chat-conv-chevron" />
                </button>
              ))
            )}
          </div>
        </>
      ) : (
      <>

      <header>
        <div>
          <button className="chat-icon-plain" onClick={() => { void loadConversations(); setView('list'); }} title="대화 목록" aria-label="대화 목록"><Menu className="h-4 w-4" /></button>
          <img src="/favicon.svg" alt="EVER-SKETCH" width={22} height={22} style={{ borderRadius: 6 }} />
          <strong>EVER-SKETCH 챗봇</strong>
        </div>
        <div className="chat-header-actions">
          <div className="chat-size-segment" role="group" aria-label="채팅 크기">
            <button type="button" className={size === 'S' ? 'active' : ''} onClick={() => pickSize('S')} title="작게 (S)" aria-label="작게">S</button>
            <button type="button" className={size === 'M' ? 'active' : ''} onClick={() => pickSize('M')} title="중간 (M)" aria-label="중간">M</button>
            <button type="button" className={size === 'L' ? 'active' : ''} onClick={() => pickSize('L')} title="크게 (L)" aria-label="크게">L</button>
          </div>
          <button onClick={() => void newChat()} title="새 대화" aria-label="새 대화" disabled={busy}>
            <Plus className="h-5 w-5" />
          </button>
          <button onClick={() => setShowGuide((v) => !v)} title="질문 가이드" aria-label="질문 가이드">
            <HelpCircle className="h-5 w-5" />
          </button>
          <button onClick={onClose} title="닫기"><PanelRightClose className="h-5 w-5" /></button>
        </div>
      </header>

      {showGuide && (() => {
        const screen = screenContext?.page ? SCREEN_GUIDE[screenContext.page] : undefined;
        const ask = (q: string) => { setShowGuide(false); void send(q); };
        return (
          <div className="chat-guide" role="dialog" aria-label="질문 가이드">
            <div className="chat-guide-head">
              <strong>질문 가이드</strong>
              <button onClick={() => setShowGuide(false)} title="닫기"><X className="h-4 w-4" /></button>
            </div>
            <div className="chat-guide-body">
              <section className="chat-guide-section screen">
                <h4>📍 현재 화면 특화 {screen ? `· ${screen.label}` : ''}</h4>
                {screen ? (
                  <div className="chat-guide-chips">
                    {screen.questions.map((q, i) => (
                      <button key={i} type="button" className="chat-guide-chip" disabled={busy} onClick={() => ask(q)}>{q}</button>
                    ))}
                  </div>
                ) : (
                  <p className="chat-guide-empty">이 화면에 특화된 추천 질문이 없습니다. 아래 공통 질문을 사용하세요.</p>
                )}
              </section>
              <section className="chat-guide-section common">
                <h4>💬 공통 질문</h4>
                <div className="chat-guide-chips">
                  {GENERAL_GUIDE.map((q, i) => (
                    <button key={i} type="button" className="chat-guide-chip" disabled={busy} onClick={() => ask(q)}>{q}</button>
                  ))}
                </div>
              </section>
            </div>
          </div>
        );
      })()}

      <div className="chat-messages">
        {!noUserMsgs && messages.map((message, index) => {
          const prevMsg = messages[index - 1];
          const showDay = !!message.ts && (!prevMsg || _dayKey(prevMsg.ts) !== _dayKey(message.ts));
          return (
          <React.Fragment key={`${message.role}-${index}`}>
            {showDay && <div className="chat-day-divider">{_fmtDay(message.ts as number)}</div>}
          <div className={`chat-bubble ${message.role} ${message.status ? `status-${message.status}` : ''}`}>
            {message.role === 'assistant'
              ? <MarkdownView source={message.text} className="chat-markdown" />
              : message.text}
            {message.ts ? <div className="chat-msg-time">{_fmtTime(message.ts)}</div> : null}
            {message.role === 'assistant' && message.actionTrace && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eef2fb', color: '#2462EB', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>✓ {message.actionTrace.label}</span>
                {message.actionTrace.undoable && (
                  <button type="button" className="chat-answer-action" title={message.undone ? '다시 실행' : '되돌리기'} onClick={() => {
                    const wasUndone = !!message.undone;
                    onUiAction?.({ type: wasUndone ? 'redo' : 'undo', auto_apply: true });
                    setMessages((prev) => prev.map((mm, i2) => (i2 === index ? { ...mm, undone: !wasUndone } : mm)));
                  }}>{message.undone ? '↪ 다시 실행' : '↩ 되돌리기'}</button>
                )}
                <button type="button" className="chat-icon-action" title="복사" aria-label="복사" onClick={() => void copyAnswer(message.text, index)}>
                  {copiedIdx === index ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            {message.role === 'assistant' && message.status !== 'confirm_required'
              && message.text && message.text !== '(빈 응답)' && !message.actionTrace && (
              <div className="chat-answer-actions">
                <button type="button" className="chat-icon-action" title="복사" aria-label="복사" onClick={() => void copyAnswer(message.text, index)}>
                  {copiedIdx === index ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                {!message.actionTrace && index === messages.length - 1 && (
                  <button type="button" className="chat-icon-action" title="다시 생성" aria-label="다시 생성" disabled={busy} onClick={() => regenerate(index)}>
                    <RotateCw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            {message.role === 'assistant' && message.status === 'confirm_required' && (
              <div className="chat-confirm">
                <button
                  type="button"
                  className="chat-confirm-yes"
                  disabled={busy}
                  onClick={() => void send('확인', { confirm: true, confirmActionId: message.pendingActionId })}
                >
                  확인
                </button>
                <button
                  type="button"
                  className="chat-confirm-no"
                  disabled={busy}
                  onClick={() => void send('취소', { confirm: false, confirmActionId: message.pendingActionId })}
                >
                  취소
                </button>
              </div>
            )}
            {message.role === 'assistant' && message.status !== 'confirm_required' && index === messages.length - 1 && (message.suggestions?.length ?? 0) > 0 && (
              <div className="chat-suggestions">
                {message.suggestions!.map((s, i) => (
                  <button key={i} type="button" className="chat-suggestion" disabled={busy} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
            {message.role === 'user' && (
              <div className="chat-user-actions">
                <button type="button" className="chat-icon-action" title="복사" aria-label="복사" onClick={() => void copyAnswer(message.text, index)}>
                  {copiedIdx === index ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <button type="button" className="chat-icon-action" title="수정" aria-label="수정" onClick={() => setDraft(message.text)}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </React.Fragment>
          );
        })}
        {noUserMsgs && (
          <div className="chat-splash">
            <img src="/favicon.svg" className="chat-splash-logo" alt="EVER-SKETCH" />
            <div className="chat-splash-name">EVER-SKETCH</div>
            <div className="chat-splash-sub">AI 스케치 챗봇</div>
            <div className="chat-splash-hint">이렇게 말해보세요</div>
            <div className="chat-empty-grid">
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button key={i} type="button" className="chat-empty-card" disabled={busy} onClick={() => void send(ex)}>{ex}</button>
              ))}
            </div>
          </div>
        )}
        {busy && (
          <div className="chat-loading" aria-label="답변 생성 중">
            <span className="chat-loading-dot" />
            <span className="chat-loading-dot" />
            <span className="chat-loading-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <footer>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void send();
          }}
          placeholder="무엇이든 물어보세요 (예: 이북 어떻게 만들어?)"
        />
        <button onClick={() => void send()} disabled={busy || !draft.trim()} title="전송">
          {busy ? <X className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </footer>
      </>
      )}
    </aside>
  );
};

export default ChatPanel;
