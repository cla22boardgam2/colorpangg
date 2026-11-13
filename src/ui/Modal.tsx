import type { ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose?: () => void; children: ReactNode }) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h2>{title}</h2>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="닫기">
              ✕
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
