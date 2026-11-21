import {galleryKind, galleryKinds, workKinds} from './gallery-types.mjs';

const safe = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const encode = value => encodeURIComponent(value || '');
const decode = value => { try { return decodeURIComponent(value || ''); } catch { return ''; } };

export function galleryRoute(hash) {
  const [view, id, type, classId, origin] = hash.replace(/^#/, '').split('/');
  return view === 'gallery' ? {id: id === '_' ? '' : decode(id), type: galleryKind(type), classId: decode(classId), home: origin === 'home'} : {id:'', type:'all', classId:'', home:false};
}

export function galleryListUrl(type = 'all', classId = '') {
  return type === 'all' && !classId ? '#gallery' : '#gallery/_/' + galleryKind(type) + (classId ? '/' + encode(classId) : '');
}

export function homeListUrl(type = 'all') {
  return type === 'all' ? '#home' : '#home/' + galleryKind(type);
}

export function galleryFilters(current) {
  return '<div class="work-filters" role="group" aria-label="작품 유형">' + Object.entries(galleryKinds).map(([key,label]) =>
    '<button type="button" data-work-type="' + key + '" aria-pressed="' + (key === current) + '">' + label + '</button>'
  ).join('') + '</div>';
}

export function exhibitCards(works, type, classId, home = false) {
  return '<div class="dol-examples work-cards">' + works.map(work => {
    const image = work.assets?.find(a => a.mime?.startsWith('image/') && a.size !== 0);
    const kinds = workKinds(work);
    const url = '#gallery/' + encode(work.id) + '/' + galleryKind(type) + '/' + encode(classId) + (home ? '/home' : '');
    const thumb = image
      ? '<img loading="lazy" src="/api/school/gallery/' + encode(work.id) + '/asset/' + encode(image.id) + '" alt="">'
      : '<span class="work-placeholder" aria-hidden="true">' + safe(galleryKinds[kinds[0]] || '작품') + '</span>';
    return '<a href="' + safe(url) + '" class="dol-example">' + thumb + '<span><strong>' + safe(work.title) + '</strong><small>' + safe(kinds.map(k=>galleryKinds[k]).join(' · ')) + '</small><small>' + safe(work.displayName) + (work.stage ? ' · ' + safe(work.stage) : '') + ' · 버전 ' + safe(work.number) + '</small></span></a>';
  }).join('') + '</div>';
}

export function sampleCards(items, type, origin, classId = '') {
  return '<div class="dol-examples work-cards">' + items.map(work => {
    const path = '#sample/' + encode(work.id) + '/' + origin + '/' + galleryKind(type) + (classId ? '/' + encode(classId) : '');
    return '<a href="' + safe(path) + '" class="dol-example"><img loading="lazy" src="' + safe(work.image) + '" alt=""><span><strong>' + safe(work.title) + '</strong><small>예시 · ' + safe(work.types.map(k=>galleryKinds[k]).join(' · ')) + '</small></span></a>';
  }).join('') + '</div>';
}

export function sampleReturn(hash) {
  const [, , origin, selected, classId] = hash.replace(/^#/, '').split('/');
  const type = galleryKind(selected);
  return origin === 'gallery' ? {href:galleryListUrl(type, decode(classId)), label:'← 친구 작품 목록'} : {href:homeListUrl(type), label:'← 연구소 홈'};
}

export function galleryEmpty(type) {
  return '<p class="work-empty">' + (type === 'all' ? '아직 이곳에 전시한 작품이 없어요.' : '아직 ' + safe(galleryKinds[type]) + ' 유형의 작품이 없어요.') + '</p>';
}
