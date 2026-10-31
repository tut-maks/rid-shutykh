// ---- КОЛІЯ: рендер головної + плавна прокрутка (без inline-скриптів, CSP 'self')
(function(){
var ease=function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
var anim=null;
function smoothTo(el,push){
  var head=document.querySelector('header');var off=(head?head.offsetHeight:0)+16;
  var start=window.scrollY,target=Math.max(0,el.getBoundingClientRect().top+start-off),dist=target-start;
  if(Math.abs(dist)<2)return;
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){window.scrollTo(0,target);return}
  var dur=Math.min(1400,Math.max(650,Math.abs(dist)*0.45)),t0=null;
  if(anim)cancelAnimationFrame(anim);
  document.documentElement.style.scrollBehavior='auto';
  function step(ts){if(t0===null)t0=ts;var p=Math.min(1,(ts-t0)/dur);window.scrollTo(0,start+dist*ease(p));if(p<1)anim=requestAnimationFrame(step);else{anim=null;document.documentElement.style.scrollBehavior=''}}
  anim=requestAnimationFrame(step);
  if(push&&history.pushState)history.pushState(null,'','#'+el.id);
}
['wheel','touchstart','keydown'].forEach(function(ev){window.addEventListener(ev,function(){if(anim){cancelAnimationFrame(anim);anim=null;document.documentElement.style.scrollBehavior=''}},{passive:true})});
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('a[href*="#"]');if(!a||e.defaultPrevented&&!a.dataset.k)return;
  var u=new URL(a.getAttribute('href'),location.href);
  if(u.pathname.replace(/\/$/,'')!==location.pathname.replace(/\/$/,'')||!u.hash)return;
  var el=document.getElementById(decodeURIComponent(u.hash.slice(1)));if(!el)return;
  e.preventDefault();setTimeout(function(){smoothTo(el,true)},0);
});
window.__kolSmooth=smoothTo;
function arrive(){if(!location.hash)return;var el=document.getElementById(decodeURIComponent(location.hash.slice(1)));if(!el)return;window.scrollTo(0,0);setTimeout(function(){smoothTo(el,false)},350)}
if('scrollRestoration' in history)history.scrollRestoration='manual';

var tpl=document.getElementById('t');
if(!tpl){document.addEventListener('DOMContentLoaded',arrive);return}
class DCLogic{constructor(p){this.props=p||{};this.state={}} setState(o){Object.assign(this.state,o);render()}}
class Component extends DCLogic {
  constructor(props) {
    super(props);
    this.state = { diam: '', size: '', cat: 'all', seg: 'all' };
  }
  renderVals() {
    const T = '/koliya-p7x4/img/tire-card.svg';
    const G = '/koliya-p7x4/img/tire-card-grey.svg';
    const all = [
      { size: '18.4-38', brand: 'Petlas', model: 'TA60', d: '38', cat: 'tractor', use: 'Ведучі колеса тракторів МТЗ, John Deere, New Holland' },
      { size: '18.4-34', brand: 'Petlas', model: 'TA60', d: '34', cat: 'tractor', use: 'Задня вісь тракторів середньої потужності' },
      { size: '420/85R30', brand: 'Petlas', model: 'TA110', d: '30', cat: 'tractor', use: 'Радіальна тракторна шина, менший тиск на ґрунт' },
      { size: '11.2-20', brand: 'Ozka', model: 'KNK50', d: '20', cat: 'tractor', use: 'Передня вісь тракторів' },
      { size: '23.1-26', brand: 'Petlas', model: 'BD65', d: '26', cat: 'combine', use: 'Ведучі колеса зернозбиральних комбайнів' },
      { size: '710/50R26.5', brand: 'Petlas', model: 'PT FLOT', d: '26.5', cat: 'combine', use: 'Флотаційна шина для важких причепів і комбайнів' },
      { size: '6.50/80-13', brand: 'Petlas', model: 'TA50', d: '13', cat: 'trailer', use: 'Сівалки, культиватори, причіпні знаряддя' },
      { size: '9.00-16', brand: 'Ozka', model: 'KNK27', d: '16', cat: 'trailer', use: 'Причепи, сільгоспмашини, передні осі' },
      { size: '11.5/80-15.3', brand: 'Ozka', model: 'KNK48', d: '15.3', cat: 'trailer', use: 'Прес-підбирачі, причепи, сівалки' },
      { size: '230/95R32', brand: 'Ozka', model: 'AGRO10', d: '32', cat: 'sprayer', use: 'Міжрядна обробка, самохідні обприскувачі' },
      { size: '12.5/80-18', brand: 'Petlas', model: 'IND25', d: '18', cat: 'backhoe', use: 'Передня вісь екскаваторів-навантажувачів' },
      { size: '16.9-28', brand: 'Petlas', model: 'IND25', d: '28', cat: 'backhoe', use: 'Задня вісь екскаваторів-навантажувачів' },
      { size: '18.4-26', brand: 'Petlas', model: 'IND25', d: '26', cat: 'backhoe', use: 'Екскаватори-навантажувачі, ведуча вісь' },
      { size: '440/80R28', brand: 'Petlas', model: 'PTX ND31', d: '28', cat: 'backhoe', use: 'Радіальна шина для JCB, CAT, Komatsu' },
      { size: '460/70R24', brand: 'Petlas', model: 'PTX ND33', d: '24', cat: 'telehandler', use: 'Телескопічні навантажувачі, радіальна' },
      { size: '16.0/70-20', brand: 'Petlas', model: 'IND25', d: '20', cat: 'telehandler', use: 'Телескопічна та компактна техніка' },
      { size: '17.5L-24', brand: 'Ozka', model: 'IND80', d: '24', cat: 'wheelloader', use: 'Фронтальні навантажувачі' },
      { size: '19.5L-24', brand: 'Petlas', model: 'IND25', d: '24', cat: 'wheelloader', use: 'Фронтальні навантажувачі та грейдери' },
      { size: '405/70-24', brand: 'Petlas', model: 'IND15', d: '24', cat: 'wheelloader', use: 'Навантажувачі, будівельна техніка' },
      { size: '10-16.5', brand: 'Ozka', model: 'LD90', d: '16.5', cat: 'skid', use: 'Міні-навантажувачі Bobcat та аналоги' },
      { size: '12-16.5', brand: 'Ozka', model: 'LD90', d: '16.5', cat: 'skid', use: 'Міні-навантажувачі, посилена 14PR' },
      { size: '6.50-10', brand: 'Petlas', model: 'HL10', d: '10', cat: 'forklift', use: 'Вилкові навантажувачі' },
      { size: '5.00-8', brand: 'Petlas', model: 'HL10', d: '8', cat: 'forklift', use: 'Вилкові навантажувачі, складська техніка' },
      { size: '7.00-12', brand: 'Ozka', model: 'KNK40', d: '12', cat: 'forklift', use: 'Вилкові навантажувачі, причепи' },
      { size: '10.00-20', brand: 'Petlas', model: 'NB38', d: '20', cat: 'truck', use: 'Вантажна та кар’єрна техніка' },
      { size: '10.00-20', brand: 'Ozka', model: 'LD94', d: '20', cat: 'truck', use: 'Індустріальна, кар’єрна техніка' },
      { size: '385/65R22.5', brand: 'Petlas', model: 'NZ305', d: '22.5', cat: 'truck', use: 'Причіпна вісь вантажівок і напівпричепів' }
    ];
    const AGRO = ['tractor', 'combine', 'trailer', 'sprayer'];
    const catDefs = [
      { id: 'all', label: 'Усі' },
      { id: 'tractor', label: 'Трактори' },
      { id: 'combine', label: 'Комбайни' },
      { id: 'trailer', label: 'Причіпна' },
      { id: 'sprayer', label: 'Обприскувачі' },
      { id: 'backhoe', label: 'Екскаватори-навантажувачі' },
      { id: 'wheelloader', label: 'Фронтальні' },
      { id: 'telehandler', label: 'Телескопічні' },
      { id: 'skid', label: 'Міні-навантажувачі' },
      { id: 'forklift', label: 'Вилкові' },
      { id: 'truck', label: 'Вантажні' }
    ];
    const s = this.state;
    const base = this.props.base ?? '';
    const segOf = (c) => (AGRO.indexOf(c) >= 0 ? 'agro' : 'build');
    const inSeg = (x) => s.seg === 'all' || segOf(x.cat) === s.seg;
    const diamList = Array.from(new Set(all.map((x) => x.d))).sort((a, b) => parseFloat(a) - parseFloat(b));
    const byDiam = all.filter((x) => (!s.diam || x.d === s.diam) && inSeg(x));
    const sizes = Array.from(new Set(byDiam.map((x) => x.size)));
    const items = all
      .filter(inSeg)
      .filter((x) => !s.diam || x.d === s.diam)
      .filter((x) => !s.size || x.size === s.size)
      .filter((x) => s.cat === 'all' || x.cat === s.cat)
      .map((x) => ({ ...x, img: segOf(x.cat) === 'build' ? G : T, diamLabel: 'R' + x.d }));
    const catName = (catDefs.find((c) => c.id === s.cat) || catDefs[0]).label;
    const parts = [];
    if (s.diam) parts.push('діаметр ' + s.diam + '″');
    if (s.size) parts.push('розмір ' + s.size);
    if (s.cat !== 'all') parts.push(catName.toLowerCase());
    const hasFilter = parts.length > 0;
    const pickCat = (id) => () => this.setState({ cat: id, seg: id === 'all' ? s.seg : segOf(id) });
    const tiles = [
      { id: 'tractor', slug: 'shyny-dlia-traktoriv', label: 'Тракторні шини', note: 'R20 — R38', photo: '/koliya-p7x4/img/tractorbig.jpg' },
      { id: 'combine', slug: 'shyny-dlia-kombainiv', label: 'Для комбайнів', note: 'R26 — R26.5', photo: '/koliya-p7x4/img/combine.jpg' },
      { id: 'trailer', slug: 'shyny-dlia-prychipnoi-tekhniky', label: 'Причіпна техніка', note: 'R13 — R16', photo: '/koliya-p7x4/img/implements.jpg' },
      { id: 'sprayer', slug: 'shyny-dlia-obpryskuvachiv', label: 'Обприскувачі', note: 'вузькі R32', photo: '/koliya-p7x4/img/horizon.jpg' },
      { id: 'backhoe', slug: 'shyny-dlia-ekskavatoriv-navantazhuvachiv', label: 'Екскаватори-навантажувачі', note: 'R18 — R28', photo: '/koliya-p7x4/img/backhoe.jpg' },
      { id: 'wheelloader', slug: 'shyny-dlia-frontalnykh-navantazhuvachiv', label: 'Фронтальні навантажувачі', note: 'R24 — R25', photo: '/koliya-p7x4/img/frontloader.jpg' },
      { id: 'telehandler', slug: 'shyny-dlia-teleskopichnykh-navantazhuvachiv', label: 'Телескопічні', note: 'R20 — R24', photo: '/koliya-p7x4/img/telehandler.jpg' },
      { id: 'skid', slug: 'shyny-dlia-mini-navantazhuvachiv', label: 'Міні-навантажувачі', note: 'R16.5', photo: '/koliya-p7x4/img/loader.jpg' },
      { id: 'forklift', slug: 'shyny-dlia-vylkovykh-navantazhuvachiv', label: 'Вилкові навантажувачі', note: 'R8 — R12', photo: '/koliya-p7x4/img/forklift.jpg' },
      { id: 'truck', slug: 'shyny-dlia-vantazhnoi-tekhniky', label: 'Вантажна та кар’єрна', note: 'R20 — R22.5', photo: '/koliya-p7x4/img/truck.jpg' }
    ];
    const segDefs = [{ id: 'all', label: 'Усе' }, { id: 'agro', label: 'Агро' }, { id: 'build', label: 'Спецтехніка' }];
    const setSeg = (id) => () => this.setState({ seg: id, cat: 'all', diam: '', size: '' });
    const sizesRow = ['18.4-38', '12.5/80-18', '420/85R30', '17.5L-24', '9.00-16', '10-16.5', '440/80R28', '6.50-10', '23.1-26', '385/65R22.5', '230/95R32', '16.9-28'];
    return {
      brand: this.props.brand ?? 'КОЛІЯ',
      marquee: sizesRow.concat(sizesRow),
      diams: diamList.map((d) => ({
        label: d + '″',
        cls: s.diam === d ? 'on' : '',
        pick: () => this.setState({ diam: s.diam === d ? '' : d, size: '' })
      })),
      sizes: sizes,
      size: s.size,
      sizeHint: s.diam ? 'Усі розміри R' + s.diam : 'Спершу оберіть діаметр або всі розміри',
      onSize: (e) => this.setState({ size: e.target.value }),
      cats: catDefs,
      cat: s.cat,
      onCatSel: (e) => this.setState({ cat: e.target.value }),
      count: items.length,
      tabs: catDefs.filter((c) => c.id === 'all' || s.seg === 'all' || segOf(c.id) === s.seg).map((c) => ({ label: c.label, cls: s.cat === c.id ? 'on' : '', pick: pickCat(c.id) })),
      segs: segDefs.map((g) => ({ label: g.label, cls: s.seg === g.id ? 'on' : '', pick: setSeg(g.id) })),
      goAgro: setSeg('agro'),
      goBuild: setSeg('build'),
      catTiles: tiles.map((t) => ({
        ...t,
        href: base + t.slug,
        isTractor: t.id === 'tractor',
        isCombine: t.id === 'combine',
        isTrailer: t.id === 'trailer',
        isSprayer: t.id === 'sprayer',
        isLoader: t.id === 'loader'
      })),
      items: items,
      footCats: tiles.map((t) => ({ label: t.label, href: base + t.slug })),
      empty: items.length === 0,
      hasFilter: hasFilter,
      filterText: hasFilter ? 'Фільтр: ' + parts.join(', ') + ' — знайдено ' + items.length : 'Показано ' + items.length + ' популярних розмірів. Інші — під замовлення з заводу.',
      reset: () => this.setState({ diam: '', size: '', cat: 'all' }),
      steps: [
        { n: '01', t: 'Заявка', d: 'Телефон, форма на сайті або Viber — вкажіть техніку, розміри й кількість.' },
        { n: '02', t: 'Технічний підбір', d: 'Перевіримо розмір, навантаження й тиск, надішлемо ціну та наявність.' },
        { n: '03', t: 'Оплата', d: 'Безготівковий розрахунок з ПДВ, для партнерів — відстрочка.' },
        { n: '04', t: 'Доставка', d: 'Відвантаження зі складу під Києвом і доставка по Україні.' }
      ]
    };
  }
}
window.__C=Component;
var c=new Component({"brand":"КОЛІЯ","base":"/koliya-p7x4/"});
var get=function(sc,p){return p.trim().split('.').reduce(function(o,k){return o==null?o:o[k]},sc)};
var interp=function(s,sc){return s.replace(/\{\{\s*([^}]+?)\s*\}\}/g,function(m,p){var v=(p==='true'||p==='false')?p:get(sc,p);return typeof v==='function'||v==null?'':String(v)})};
var expr=function(a){return a.replace(/[{}]/g,'').trim()};
function proc(node,sc){Array.prototype.slice.call(node.childNodes).forEach(function(ch){
 if(ch.nodeType===3){if(ch.textContent.indexOf('{{')>=0)ch.textContent=interp(ch.textContent,sc);return}
 if(ch.nodeType!==1)return;var tag=ch.tagName.toLowerCase();
 if(tag==='sc-for'){var list=get(sc,expr(ch.getAttribute('list')))||[],as=ch.getAttribute('as'),fr=document.createDocumentFragment();
  list.forEach(function(it,i){var cl=ch.cloneNode(true),s2=Object.assign({},sc);s2[as]=it;s2.$index=i;proc(cl,s2);while(cl.firstChild)fr.appendChild(cl.firstChild)});ch.replaceWith(fr);return}
 if(tag==='sc-if'){var v=expr(ch.getAttribute('value')),ok=v==='true'?true:v==='false'?false:!!get(sc,v);
  if(ok){proc(ch,sc);var f2=document.createDocumentFragment();while(ch.firstChild)f2.appendChild(ch.firstChild);ch.replaceWith(f2)}else ch.remove();return}
 Array.prototype.slice.call(ch.attributes).forEach(function(a){
  if(/^on[a-z]/i.test(a.name)){var fn=get(sc,expr(a.value));ch.removeAttribute(a.name);if(typeof fn==='function'){ch.dataset.k='1';ch.addEventListener(a.name.slice(2).toLowerCase(),function(e){fn(e)})}return}
  if(a.value.indexOf('{{')>=0)ch.setAttribute(a.name,interp(a.value,sc))});
 proc(ch,sc);
 if(tag==='select'&&ch.hasAttribute('value'))ch.dataset.v=ch.getAttribute('value');
})}
var first=true;
function render(){var root=document.getElementById('root'),y=window.scrollY;
 var t=tpl.content.cloneNode(true);proc(t,c.renderVals());root.replaceChildren(t);
 root.querySelectorAll('select[data-v]').forEach(function(s){s.value=s.dataset.v});
 if(!first)window.scrollTo(0,y);else arrive();first=false}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render);else render();
})();
