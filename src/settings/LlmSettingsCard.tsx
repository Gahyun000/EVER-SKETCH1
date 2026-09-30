import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Cpu, Loader2, Save, ServerOff } from 'lucide-react';
import { api } from './api';

interface EffectiveLlm {
  provider: string;
  base_url: string;
  user_id: string;
  model: string;
  enabled: boolean;
  timeout: number;
  api_key_masked: string;
  configured: boolean;
}

interface LlmSettingsResponse {
  effective: EffectiveLlm;
  providers: string[];
}

interface FormState {
  provider: string;
  base_url: string;
  user_id: string;
  api_key: string;
  model: string;
  enabled: boolean;
  timeout: string;
}

interface TestResponse {
  ok: boolean;
  configured: boolean;
  provider: string;
  url: string;
  model: string;
  user_id_set: boolean;
  api_key_set: boolean;
  status_code?: number | null;
  latency_ms?: number | null;
  message: string;
  sample?: string;
}

const EMPTY_FORM: FormState = {
  provider: 'self',
  base_url: '',
  user_id: '',
  api_key: '',
  model: '',
  enabled: true,
  timeout: '45',
};

// 서버(App_Settings)에 저장되는 '파이프라인 공용 LLM' 설정.
// 요구사항/설계서 생성 등 전 파이프라인이 이 설정을 기본으로 사용한다(외부 provider 전환 가능).
function LlmSettingsCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [data, setData] = useState<LlmSettingsResponse | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<LlmSettingsResponse>('/settings/llm');
      setData(res);
      setForm({
        provider: res.effective.provider || 'self',
        base_url: res.effective.base_url || '',
        user_id: res.effective.user_id || '',
        api_key: '',
        model: res.effective.model || '',
        enabled: res.effective.enabled,
        timeout: String(res.effective.timeout || 45),
      });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const body: Record<string, unknown> = {
        provider: form.provider.trim() || null,
        base_url: form.base_url.trim() || null,
        user_id: form.user_id.trim() || null,
        model: form.model.trim() || null,
        enabled: form.enabled,
        timeout: form.timeout ? Number(form.timeout) : null,
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      const res = await api<LlmSettingsResponse>('/settings/llm', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setData(res);
      setForm((prev) => ({ ...prev, api_key: '' }));
      setSavedMsg('저장되었습니다.');
      setTimeout(() => setSavedMsg(null), 4000);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = {
        provider: form.provider.trim() || null,
        base_url: form.base_url.trim() || null,
        user_id: form.user_id.trim() || null,
        model: form.model.trim() || null,
        enabled: form.enabled,
        timeout: form.timeout ? Number(form.timeout) : null,
      };
      if (form.api_key.trim()) body.api_key = form.api_key.trim();
      const res = await api<TestResponse>('/settings/llm/test', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setTestResult(res);
    } catch (e) {
      setTestResult({
        ok: false,
        configured: false,
        provider: form.provider,
        url: form.base_url,
        model: form.model,
        user_id_set: Boolean(form.user_id),
        api_key_set: Boolean(form.api_key || data?.effective.api_key_masked),
        message: String(e instanceof Error ? e.message : e),
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-card">
        <div className="settings-card-head">
          <Cpu className="h-4 w-4" /> <strong>파이프라인 LLM (서버 공용)</strong>
        </div>
        <p className="settings-card-loading"><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...</p>
      </div>
    );
  }

  const status = data ? (
    data.effective.configured ? (
      <span className="settings-health ok"><CheckCircle2 className="h-4 w-4" /> 구성됨 · {data.effective.provider} · {data.effective.model || '모델 미지정'}</span>
    ) : (
      <span className="settings-health bad"><ServerOff className="h-4 w-4" /> 미구성 (LLM 필수 작업 차단)</span>
    )
  ) : null;

  return (
    <div className="settings-card">
      <div className="settings-card-head">
        <Cpu className="h-4 w-4" />
        <strong>파이프라인 LLM (서버 공용)</strong>
        {status}
      </div>
      <p className="settings-card-desc">
        요구사항·설계서 자동 생성 등 <strong>전 파이프라인이 기본으로 사용하는 자체 LLM</strong>을 서버(App_Settings)에 등록합니다.
        provider 를 바꾸면 외부(OpenAI/Anthropic 등)로 전환됩니다. 미구성 시 요구사항·설계서 생성 같은 LLM 필수 작업은 실패합니다.
      </p>

      <div className="settings-grid">
        <label>
          <span>Provider</span>
          <select
            value={form.provider}
            onChange={(e) => setForm({ ...form, provider: e.target.value })}
          >
            {(data?.providers || ['self', 'openai', 'anthropic', 'custom']).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <small className="settings-help">self = 사내 자체 LLM(OpenAI 호환). anthropic 은 Messages API 사용.</small>
        </label>
        <label>
          <span>Base URL</span>
          <input
            value={form.base_url}
            onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            placeholder="http://localhost:8004/v1"
          />
          <small className="settings-help">엔드포인트 경로(/chat/completions)는 자동 부가됩니다.</small>
        </label>
        <label>
          <span>User ID</span>
          <input
            value={form.user_id}
            onChange={(e) => setForm({ ...form, user_id: e.target.value })}
            placeholder="admin 또는 서버 발급 사용자 ID"
          />
          <small className="settings-help">자체 LLM 서버가 사용자별 인증/감사를 요구하면 필수입니다.</small>
        </label>
        <label>
          <span>API Key (평문)</span>
          <input
            type="password"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            placeholder={data?.effective.api_key_masked || 'sk-…'}
            autoComplete="new-password"
          />
          <small className="settings-help">
            현재 키: <code>{data?.effective.api_key_masked || '미설정'}</code> — 비워두면 기존 값 유지
          </small>
        </label>
        <label>
          <span>모델명</span>
          <input
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="general"
          />
          {/* **앨리어스를 권한다**(2026-09-21). 게이트웨이 표준 호출규약 §4 의 권고이자,
              여기 모델명을 직접 적으면 관리자가 모델을 바꿀 때마다 이 칸도 같이 고쳐야
              하기 때문이다 — 젬마3→젬마4 처럼. 앨리어스로 적어 두면 그쪽에서 바꾸고
              끝난다. 예전 placeholder 가 `model-name` 이라 모델명을 적으라는 말로 읽혔다. */}
          <small className="settings-help">
            <code>general</code>(일반) · <code>coder</code>(코딩) · <code>ocr</code>(이미지) 처럼
            <b>앨리어스</b>를 넣으세요 — 실제 모델은 게이트웨이가 정합니다.
            모델명을 직접 적으면 그쪽에서 모델을 바꿀 때 이 칸도 같이 고쳐야 합니다.
          </small>
        </label>
        <label>
          <span>Timeout (초)</span>
          <input
            type="number"
            min={5}
            max={600}
            value={form.timeout}
            onChange={(e) => setForm({ ...form, timeout: e.target.value })}
          />
        </label>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          <span>이 LLM 활성화(파이프라인 기본으로 사용)</span>
        </label>
      </div>

      <div className="settings-card-actions">
        <button type="button" className="icon-action primary" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? '저장 중...' : '저장'}
        </button>
        <button type="button" className="icon-action" onClick={testConnection} disabled={testing}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          연결 테스트
        </button>
        {savedMsg && <span className="settings-saved">{savedMsg}</span>}
        {error && <span className="settings-error">실패: {error}</span>}
      </div>
      {testResult && (
        <div className={`settings-test-result ${testResult.ok ? 'ok' : 'bad'}`}>
          <strong>{testResult.ok ? '연결 성공' : '연결 실패'}</strong>
          <span>{testResult.message}</span>
          <small>
            URL: <code>{testResult.url || '미설정'}</code>
            {' · '}모델: <code>{testResult.model || '미설정'}</code>
            {typeof testResult.latency_ms === 'number' ? ` · ${testResult.latency_ms}ms` : ''}
          </small>
          {testResult.sample && <pre>{testResult.sample}</pre>}
        </div>
      )}
    </div>
  );
}

export default LlmSettingsCard;
