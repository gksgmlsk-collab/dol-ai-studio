export const galleryKinds = {
  all: '전체', video: '영상', image: '이미지', web: '웹', '3d': '3D',
  robot: '발명·로봇', city: '도시개발', other: '기타'
};

export function galleryKind(value) {
  return Object.hasOwn(galleryKinds, value) ? value : 'all';
}

// Exhibitions may contain multiple media and workshop files. Only the selected,
// approved assets are supplied here, including their original names on the server.
export function classifyGalleryAssets(assets = []) {
  const found = new Set();
  for (const asset of assets) {
    const kind = asset?.kind;
    const mime = String(asset?.mime || '').toLowerCase().split(';')[0];
    const name = String(asset?.filename || '').toLowerCase();
    if (['city', 'web', '3d', 'robot'].includes(kind)) found.add(kind);
    if (mime.startsWith('image/')) found.add('image');
    else if (mime.startsWith('video/')) found.add('video');
    else if (!mime.startsWith('audio/')) {
      if (kind === 'video' || kind === 'image') found.add(kind);
      if (/\.(?:mp4|webm|mov|m4v|ogv)$/.test(name)) found.add('video');
      else if (/\.(?:png|jpe?g|gif|webp|avif|svg|bmp)$/.test(name)) found.add('image');
      else if (mime === 'text/html' || /\.(?:html?|dol-web\.json)$/.test(name)) found.add('web');
      else if (mime.startsWith('model/') || /\.(?:stl|obj|glb|gltf|3mf|dol-3d\.json)$/.test(name)) found.add('3d');
      else if (/\.dol-robot\.json$/.test(name)) found.add('robot');
      else if (/\.dol-city\.json$/.test(name)) found.add('city');
    }
  }
  return found.size ? Object.keys(galleryKinds).filter(key => found.has(key)) : ['other'];
}

export function workKinds(work) {
  return Array.isArray(work.types) && work.types.length ? work.types : classifyGalleryAssets(work.assets);
}

export function filterGallery(works, kind) {
  const selected = galleryKind(kind);
  return selected === 'all' ? works : works.filter(work => workKinds(work).includes(selected));
}

export function publicCityUrl(value) {
  if (typeof value !== 'string' || !/^https:\/\/[^\s\\]+$/i.test(value)) return '';
  try {
    const url = new URL(value);
    if (url.origin !== 'https://namijini-future-city-production.up.railway.app' ||
        !url.pathname.startsWith('/future-city/') || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}
