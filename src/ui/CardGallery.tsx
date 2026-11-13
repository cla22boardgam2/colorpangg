import { createDeck } from '../game/deck';
import { CardBack } from './CardBack';
import { CardView } from './CardView';

/** 카드 시안 확인용 화면 (?gallery) */
export function CardGallery() {
  const deck = createDeck();
  const unique = deck.filter((c, i) => deck.findIndex((d) => d.kind === c.kind && d.color === c.color && d.value === c.value) === i);
  const rows = ['red', 'yellow', 'green', 'blue', null].map((color) => unique.filter((c) => c.color === color));
  return (
    <div className="gallery">
      <h1 className="title">컬러팡 카드 시안</h1>
      {rows.map((row, i) => (
        <div key={i} className="gallery__row">
          {row.map((c) => (
            <CardView key={c.id} card={c} size="md" />
          ))}
          {i === 4 && <CardBack size="md" />}
        </div>
      ))}
      <h2>크기 비교 (작게 / 보통 / 크게)</h2>
      <div className="gallery__row">
        <CardView card={unique[7]} size="sm" />
        <CardView card={unique[7]} size="md" />
        <CardView card={unique[7]} size="lg" />
        <CardView card={unique[11]} size="lg" playable />
        <CardBack size="lg" />
      </div>
    </div>
  );
}
