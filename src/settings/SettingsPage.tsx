import { Settings } from 'lucide-react';
import LlmSettingsCard from './LlmSettingsCard';

export default function SettingsPage() {
  return (
    <section className="settings-canvas">
      <div className="settings-hero">
        <div className="settings-icon"><Settings className="h-5 w-5" /></div>
        <div>
          <h2>환경 설정</h2>
          <p>운영용 공용 설정은 서버에 저장합니다. API Key는 브라우저에 저장하지 않습니다.</p>
        </div>
      </div>
      <LlmSettingsCard />
    </section>
  );
}
