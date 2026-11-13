import { CardGallery } from './ui/CardGallery';

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('gallery')) return <CardGallery />;
  return <h1 className="title">컬러팡</h1>;
}
