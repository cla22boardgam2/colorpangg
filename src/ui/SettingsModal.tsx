import { useState } from 'react';
import { Modal } from './Modal';
import { RELAY_KEY } from '../net/realtime';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState(() => {
    try {
      return localStorage.getItem(RELAY_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [saved, setSaved] = useState(false);

  const save = () => {
    try {
      if (url.trim()) localStorage.setItem(RELAY_KEY, url.trim());
      else localStorage.removeItem(RELAY_KEY);
      setSaved(true);
    } catch {
      /* 무시 */
    }
  };
  const reset = () => {
    setUrl('');
    try {
      localStorage.removeItem(RELAY_KEY);
      setSaved(true);
    } catch {
      /* 무시 */
    }
  };

  return (
    <Modal title="⚙️ 실시간 서버 설정" onClose={onClose}>
      <p className="muted">
        비워 두면 <b>공용 클라우드</b>로 자동 연결돼요. 학교 방화벽 때문에 연결이 안 되거나 우리 반 전용 서버를 쓰고 싶을 때만
        개인 서버 주소(예: <code>wss://my-class-colorpang.onrender.com</code> 또는 <code>ws://192.168.0.23:8080</code>)를 넣어 주세요.
      </p>
      <input
        className="input"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setSaved(false);
        }}
        placeholder="wss://..."
        inputMode="url"
        autoCapitalize="off"
        spellCheck={false}
      />
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={reset}>
          공용 클라우드로 되돌리기
        </button>
        <button className="btn btn--primary" onClick={save}>
          저장
        </button>
      </div>
      {saved && <p className="ok">저장했어요! 방에 새로 들어가면 적용돼요.</p>}
    </Modal>
  );
}
