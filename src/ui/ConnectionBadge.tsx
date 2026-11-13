export function ConnectionBadge({ online, provider }: { online: boolean; provider: string }) {
  return (
    <span className={`conn${online ? ' conn--on' : ''}`}>
      <span className="conn__dot" />
      {online ? provider : '연결 중...'}
    </span>
  );
}
