"""settings_store 단위테스트 — 임시 DB로 load/save/mask/endpoint/env폴백 검증 (REQ-F-010)."""
import os, sys, tempfile, pathlib
_tmp = tempfile.mkdtemp()
os.environ["EBOOK_HTML_DB"] = str(pathlib.Path(_tmp) / "t.db")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
from server import settings_store as ss  # noqa: E402

fails = []
def ok(name, cond):
    print(("✓ " if cond else "✗ ") + name)
    if not cond: fails.append(name)

ss.init_db()
d0 = ss.load_llm_settings()
ok("초기 기본값 provider=self", d0["provider"] == "self")
ok("초기 configured=False", d0["configured"] is False)

saved = ss.save_llm_settings({
    "provider":"self","base_url":"http://x:8004/v1","user_id":"u1",
    "api_key":"sk-abc123456789","model":"gemma3:27b","enabled":True,"timeout":30,
}, updated_by="test")
ok("저장 후 configured=True", saved["configured"] is True)
ok("저장 후 model 반영", saved["model"] == "gemma3:27b")
ok("timeout 코어스(30.0)", abs(saved["timeout"] - 30.0) < 1e-6)

openai_ok = ss.save_llm_settings({
    "provider": "openai", "base_url": "https://api.openai.com/v1", "user_id": "",
    "api_key": "sk-abc123456789", "model": "gpt-test", "enabled": True, "timeout": 30,
}, updated_by="test")
ok("openai provider 는 user_id 없이 configured=True", openai_ok["configured"] is True)

self_missing_user = ss.save_llm_settings({
    "provider": "self", "base_url": "http://x:8004/v1", "user_id": "",
    "api_key": "sk-abc123456789", "model": "gemma3:27b", "enabled": True, "timeout": 30,
}, updated_by="test")
ok("self provider 는 user_id 없으면 configured=False", self_missing_user["configured"] is False)

d1 = ss.load_llm_settings()
ok("재로딩 api_key 유지", d1["api_key"] == "sk-abc123456789")
ok("mask_key 마스킹(원문 미노출)", "sk-abc123456789" not in ss.mask_key(d1["api_key"]) and len(ss.mask_key(d1["api_key"])) > 0)

# env 폴백 (DB 비운 새 키는 env로)
os.environ["LLM_MODEL"] = "env-model"
raw = ss.save_llm_settings({"provider":"self","base_url":"","user_id":"","api_key":"","model":"","enabled":True,"timeout":45})
d2 = ss.load_llm_settings()
ok("env 폴백 LLM_MODEL 적용", d2["model"] == "env-model")

ep = ss.llm_endpoint("self", "http://h:1/v1")
ok("llm_endpoint 문자열 반환", isinstance(ep, str) and len(ep) > 0)

ok("_coerce_bool('true')", ss._coerce_bool("true", False) is True)
ok("_coerce_float('abc'→default)", ss._coerce_float("abc", 45.0) == 45.0)

if fails:
    print(f"\n{len(fails)} FAIL: {fails}"); sys.exit(1)
print("\nALL PASS")
