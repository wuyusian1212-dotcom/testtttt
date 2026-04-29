
/* ══════════════════════════════════════
   FIREBASE CONFIG
   ▶ 請至 https://console.firebase.google.com
     建立專案後，將設定值填入下方
══════════════════════════════════════ */
const firebaseConfig = {
  apiKey:            "AIzaSyD4zU-cIUhlNKlldTD2mfZcqY3u9QqVnMU",
  authDomain:        "ncu-rideshare-76451.firebaseapp.com",
  databaseURL:       "https://ncu-rideshare-76451-default-rtdb.firebaseio.com",
  projectId:         "ncu-rideshare-76451",
  storageBucket:     "ncu-rideshare-76451.firebasestorage.app",
  messagingSenderId: "82022528329",
  appId:             "1:82022528329:web:c3ec30359f93f979d25698",
  measurementId:     "G-F843QL58GQ"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ══════════════════════════════════════
   STATE
══════════════════════════════════════ */
let currentUser      = null;
let currentMode      = 'instant';
let currentPage      = 'home';
let selectedRideId   = null;
let userPoints       = 0;
let currentChatId    = null;
let currentFilter    = 'all';
let RIDES            = [];
let SCHED_RIDES      = [];
let ridesUnsubscribe = null;
let msgsUnsubscribe  = null;
let botTimers        = [];
let localBotMsgs     = [];
let currentRealMsgs  = [];
let localChatHistory = {};   // rideId → messages[]

/* Google Maps 相關變數 */
let gMap, directionsService, directionsRenderer, geocoder;
let placesAuto, placesAutoSched, placesAutoCreate;
const NCU = { lat: 24.9683, lng: 121.1944 }; // 中央大學
let userLocation = NCU;

const AVG_COLORS = ['#333333','#555555','#777777','#444444','#666666','#222222'];

/* ══════════════════════════════════════
   SIMULATED USER — 王同學
══════════════════════════════════════ */
currentUser = { uid: 'wang-tonglue-001', displayName: '王同學', email: 'wang@ncu.edu.tw', photoURL: '' };
userPoints  = 280;

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('avatarSm').textContent      = '王';
  document.getElementById('profileAvatar').textContent = '王';
  document.getElementById('profileName').textContent   = '王同學';
  document.getElementById('profileId').textContent     = 'wang@ncu.edu.tw';
  document.getElementById('headerPoints').textContent  = userPoints;
  document.getElementById('totalPoints').textContent   = userPoints + ' 點';
  init();
});


/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
function init() {
  loadLocalRides();
  renderPointsList();
  renderCoupons();
  renderHistory();
  setDefaultDateTime();
  startCountdowns();
}

/* ══════════════════════════════════════
   LOCAL RIDE DATA（模擬資料，無需 Firestore）
══════════════════════════════════════ */
function loadLocalRides() {
  let nextId = 1;
  const mk = obj => ({ id: 'ride_' + (nextId++), memberUids: [], ...obj });

  RIDES = [
    mk({ from:'中央大學 正門',  to:'中壢火車站', time:'現在',    countdown:8,  people:3, max:4, fare:180, category:'station', scheduled:false, members:['王','林','陳'] }),
    mk({ from:'中央大學 宿舍區',to:'SOGO 百貨',  time:'10分鐘後',countdown:10, people:2, max:4, fare:150, category:'mall',    scheduled:false, members:['李','張'] }),
    mk({ from:'中央大學 圖書館',to:'桃園機場',   time:'現在',    countdown:3,  people:1, max:4, fare:550, category:'airport', scheduled:false, members:['吳'] }),
    mk({ from:'中央大學 正門',  to:'台北車站',   time:'15分鐘後',countdown:15, people:4, max:4, fare:480, category:'station', scheduled:false, members:['周','趙','孫','錢'] }),
  ];
  SCHED_RIDES = [
    mk({ from:'中央大學 正門',  to:'中壢火車站', time:'今天 18:00', countdown:0, people:2, max:4, fare:180, category:'station', scheduled:true, members:['王','林'] }),
    mk({ from:'中央大學 宿舍區',to:'高鐵桃園站', time:'明天 07:30', countdown:0, people:1, max:4, fare:320, category:'station', scheduled:true, members:['陳'] }),
    mk({ from:'中央大學 正門',  to:'台北車站',   time:'明天 17:00', countdown:0, people:3, max:4, fare:480, category:'station', scheduled:true, members:['李','張','劉'] }),
  ];

  renderRides(currentFilter);
  renderSchedRides();
  renderChatRooms();
  document.getElementById('rideCount').textContent = RIDES.length;
}

/* ══════════════════════════════════════
   PAGE SWITCHING
══════════════════════════════════════ */
function switchPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');
  currentPage = page;
}

/* ══════════════════════════════════════
   MODE SWITCHING
══════════════════════════════════════ */
function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + mode).classList.add('active');
  document.getElementById('mode-instant').style.display = mode === 'instant' ? 'block' : 'none';
  document.getElementById('mode-schedule').style.display = mode === 'schedule' ? 'block' : 'none';
}

/* ══════════════════════════════════════
   RENDER RIDES
══════════════════════════════════════ */
function renderRides(filter) {
  currentFilter = filter;
  const list = document.getElementById('ridesList');
  let filtered = RIDES;
  if (filter === 'now') filtered = RIDES.filter(r => (r.countdown || 0) <= 5);
  else if (filter !== 'all') filtered = RIDES.filter(r => r.category === filter);
  document.getElementById('rideCount').textContent = filtered.length;
  list.innerHTML = filtered.map(r => buildRideCard(r, false)).join('');
  list.querySelectorAll('.ride-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.classList.contains('join-btn')) return;
      toggleCard(this);
    });
  });
}

function renderSchedRides() {
  const list = document.getElementById('schedList');
  list.innerHTML = SCHED_RIDES.map(r => buildRideCard(r, true)).join('');
  list.querySelectorAll('.ride-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.classList.contains('join-btn')) return;
      toggleCard(this);
    });
  });
}

function buildRideCard(r, isSched) {
  const pct  = r.people / r.max;
  const isFull  = r.people >= r.max;
  const alreadyJoined = currentUser && (r.memberUids || []).includes(currentUser.uid);
  const dots = Array.from({length:r.max}, (_,i) =>
    `<div class="pdot ${i < r.people ? 'filled' : 'empty'}"></div>`).join('');
  const perFare = Math.ceil(r.fare / (isFull ? r.max : r.people + 1));
  const memberAv = (r.members || []).map((m,i) =>
    `<div class="member-av" style="background:${AVG_COLORS[i % AVG_COLORS.length]};color:#fff">${m}</div>`).join('');
  const badgeCls = isFull ? 'badge-full' : isSched ? 'badge-sched' : 'badge-open';
  const badgeTxt = isFull ? '已滿團' : isSched ? '預約中' : `揪人中 ${r.people}/${r.max}`;
  const cardCls  = isFull ? 'full' : isSched ? 'scheduled' : '';
  const isHot    = !isSched && r.category === 'airport';
  const joinDisabled = isFull || alreadyJoined;
  const joinTxt  = isFull ? '已滿團' : alreadyJoined ? '已加入' : '加入共乘 →';

  return `<div class="ride-card fade-up ${cardCls}" data-id="${r.id}">
    <div class="ride-top">
      <div class="ride-route">
        <div class="ride-from">📍 ${r.from}</div>
        <div class="ride-to" style="font-size:0.85rem">→ ${r.to}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">
        <span class="badge-status ${badgeCls}">${badgeTxt}</span>
        ${isHot ? '<span class="badge-status badge-hot">🔥 熱門</span>' : ''}
        ${alreadyJoined ? '<span class="badge-status badge-open">✓ 已加入</span>' : ''}
      </div>
    </div>
    <div class="seat-bar"><div class="seat-fill" style="width:${pct*100}%;${isFull?'background:var(--text3)':''}"></div></div>
    <div class="ride-bottom">
      <div class="ride-meta">⏱ ${r.time}</div>
      ${!isSched ? `<div class="ride-meta countdown">🕐 ${r.countdown||0}分</div>` : ''}
      <div class="ride-meta"><div class="people-dots">${dots}</div>${r.people}/${r.max}人</div>
      <div class="ride-fare">$${perFare}</div>
    </div>
    <div class="ride-expanded">
      <div class="ride-members">${memberAv}<div class="member-av" style="background:var(--card2);color:var(--text3);border:1px dashed var(--border)">?</div></div>
      <div style="font-size:0.72rem;color:var(--text2);margin-bottom:8px">加入後每人約 $${perFare} · 總車資 $${r.fare}</div>
      <button class="join-btn" ${joinDisabled?'disabled':''} onclick="openJoin('${r.id}')">${joinTxt}</button>
    </div>
  </div>`;
}

function toggleCard(card) {
  const wasExpanded = card.classList.contains('expanded');
  document.querySelectorAll('.ride-card').forEach(c => c.classList.remove('expanded'));
  if (!wasExpanded) card.classList.add('expanded');
}

/* ══════════════════════════════════════
   FILTER
══════════════════════════════════════ */
function filterRides(el, filter) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderRides(filter);
}

/* ══════════════════════════════════════
   JOIN MODAL
══════════════════════════════════════ */
function openJoin(id) {
  const r = RIDES.find(x => x.id === id) || SCHED_RIDES.find(x => x.id === id);
  if (!r) return;
  selectedRideId = id;
  const newPeople = r.people + 1;
  const perFare   = Math.ceil(r.fare / newPeople);
  document.getElementById('modalTitle').textContent    = '加入共乘';
  document.getElementById('modalSub').textContent      = `${r.from} → ${r.to}`;
  document.getElementById('modalFarePer').textContent  = '$' + perFare;
  document.getElementById('modalFareTotal').textContent= `總車資 $${r.fare} ÷ ${newPeople}人`;
  document.getElementById('modalFrom').textContent     = r.from;
  document.getElementById('modalTo').textContent       = r.to;
  document.getElementById('modalTime').textContent     = r.time;
  document.getElementById('modalPeople').textContent   = `${newPeople}/${r.max} 人`;
  document.getElementById('joinModal').classList.add('open');
}

function closeModal() {
  document.getElementById('joinModal').classList.remove('open');
  selectedRideId = null;
}

function confirmJoin() {
  if (!selectedRideId || !currentUser) return;
  const btn = document.querySelector('#joinModal .modal-confirm-btn');
  const all  = [...RIDES, ...SCHED_RIDES];
  const ride = all.find(x => x.id === selectedRideId);
  if (!ride) { showToast('❌ 找不到行程'); return; }
  if (ride.people >= ride.max) { showToast('❌ 已滿團'); return; }
  if ((ride.memberUids || []).includes(currentUser.uid)) { showToast('❌ 你已加入此行程'); return; }

  const initial = (currentUser.displayName || '?')[0];
  ride.people++;
  ride.members = [...(ride.members || []), initial];
  ride.memberUids = [...(ride.memberUids || []), currentUser.uid];

  // 加入系統訊息（本地）
  const roomMsgs = localChatHistory[ride.id] || [];
  roomMsgs.push({ system:true, text:`${currentUser.displayName} 加入了共乘`, timestamp:{ toDate:()=>new Date() } });
  localChatHistory[ride.id] = roomMsgs;

  userPoints += 10;
  document.getElementById('headerPoints').textContent = userPoints;
  document.getElementById('totalPoints').textContent  = userPoints + ' 點';

  renderRides(currentFilter);
  renderSchedRides();
  renderChatRooms();

  closeModal();
  showToast('✅ 成功加入！獲得 +10 點');
  const rideId = selectedRideId;
  setTimeout(() => { switchPage('chat'); openChat(rideId); }, 800);
}

/* ══════════════════════════════════════
   GOOGLE MAPS
══════════════════════════════════════ */
const MAP_STYLE = [
  { elementType: 'geometry',            stylers: [{ color: '#f0f0f0' }] },
  { elementType: 'labels.text.fill',    stylers: [{ color: '#555555' }] },
  { elementType: 'labels.text.stroke',  stylers: [{ color: '#f5f5f5' }] },
  { featureType: 'road',               elementType: 'geometry',      stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.arterial',      elementType: 'geometry',      stylers: [{ color: '#e8e8e8' }] },
  { featureType: 'road.highway',       elementType: 'geometry',      stylers: [{ color: '#dddddd' }] },
  { featureType: 'water',              elementType: 'geometry',      stylers: [{ color: '#d0d8e0' }] },
  { featureType: 'poi',                stylers: [{ visibility: 'off' }] },
  { featureType: 'transit',            stylers: [{ visibility: 'off' }] },
];

function initMap() {
  gMap = new google.maps.Map(document.getElementById('mapCanvas'), {
    center: NCU,
    zoom: 14,
    disableDefaultUI: true,
    gestureHandling: 'greedy',
    styles: MAP_STYLE,
  });

  directionsService  = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: gMap,
    suppressMarkers: false,
    polylineOptions: { strokeColor: '#111111', strokeWeight: 4 },
  });
  geocoder = new google.maps.Geocoder();

  // 中央大學標記
  new google.maps.Marker({ position: NCU, map: gMap, title: '中央大學' });

  // Places 自動補全：首頁目的地輸入框
  placesAuto = new google.maps.places.Autocomplete(
    document.getElementById('destInput'),
    { componentRestrictions: { country: 'tw' }, fields: ['geometry', 'name', 'formatted_address'] }
  );
  placesAuto.addListener('place_changed', () => {
    const place = placesAuto.getPlace();
    if (place.geometry) {
      document.getElementById('destSuggestions').classList.remove('show');
      routeTo(place.geometry.location, place.name || place.formatted_address);
    }
  });

  // Places 自動補全：預約模式目的地輸入框
  placesAutoSched = new google.maps.places.Autocomplete(
    document.getElementById('schedDest'),
    { componentRestrictions: { country: 'tw' }, fields: ['name'] }
  );

}

function routeTo(destination, label) {
  directionsService.route({
    origin: userLocation,
    destination,
    travelMode: google.maps.TravelMode.DRIVING,
  }, (result, status) => {
    if (status !== 'OK') { showToast('❌ 無法計算路線'); return; }
    directionsRenderer.setDirections(result);
    const leg    = result.routes[0].legs[0];
    const distKm = leg.distance.value / 1000;
    // 簡單車資估算：基本費 + 每公里
    const fare   = Math.round(distKm * 18 + 60);
    document.getElementById('mapDestLabel').textContent = label;
    document.getElementById('mapFare').textContent = '$' + fare;
    _lastMapDest = { name: label, fare };
    showToast(`📍 ${label}・${leg.distance.text}・約 ${leg.duration.text}`);
  });
}

function selectDestByName(name) {
  document.getElementById('destInput').value = name;
  document.getElementById('destSuggestions').classList.remove('show');
  document.getElementById('mapDestLabel').textContent = name;
  document.getElementById('mapFare').textContent = '計算中...';
  geocoder.geocode({ address: name + ', 桃園市', region: 'TW' }, (results, status) => {
    if (status === 'OK' && results[0]) {
      routeTo(results[0].geometry.location, name);
    } else {
      showToast('❌ 找不到該地點');
      document.getElementById('mapFare').textContent = '—';
    }
  });
}

function locateMe() {
  if (!navigator.geolocation) { showToast('瀏覽器不支援定位'); return; }
  showToast('📡 定位中...');
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    gMap.setCenter(userLocation);
    gMap.setZoom(15);
    geocoder.geocode({ location: userLocation }, (results, status) => {
      const addr = (status === 'OK' && results[0]) ? results[0].formatted_address : '目前位置';
      showToast('📡 已定位：' + addr);
    });
  }, () => showToast('❌ 定位失敗，請允許位置權限'));
}

/* ══════════════════════════════════════
   SCHEDULE
══════════════════════════════════════ */
function setDefaultDateTime() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  document.getElementById('schedDate').value = now.toISOString().split('T')[0];
  document.getElementById('schedTime').value = '18:00';
}

/* ══════════════════════════════════════
   CREATE INSTANT RIDE
══════════════════════════════════════ */
let _createMinutes  = 0;
let _createSeats    = 4;
let _createFare     = 0;
let _selectedCoupon = null;
let _lastMapDest    = { name: '', fare: 0 };

function parseCouponValue(discount) {
  return parseInt(discount.replace(/[^0-9]/g, ''), 10) || 0;
}

function updateCreateFarePreview() {
  const preview = document.getElementById('createFarePreview');
  if (!_createFare) { preview.style.display = 'none'; return; }

  const discountVal   = _selectedCoupon ? parseCouponValue(_selectedCoupon.discount) : 0;
  const discountedTotal = Math.max(0, _createFare - discountVal);
  const perFare       = Math.ceil(discountedTotal);
  const originalEl    = document.getElementById('createFareOriginal');

  preview.style.display = 'block';
  document.getElementById('createFarePer').textContent = '$' + perFare;

  if (discountVal > 0) {
    originalEl.style.display = 'block';
    originalEl.textContent   = `原價 $${_createFare}（已折 ${_selectedCoupon.discount}）`;
  } else {
    originalEl.style.display = 'none';
  }

  document.getElementById('createFareTotal').textContent =
    `總車資 $${discountedTotal} · 滿${_createSeats}人每人約 $${Math.ceil(discountedTotal / _createSeats)}`;
}

function renderCreateCoupons() {
  const container = document.getElementById('createCouponList');
  if (COUPONS.length === 0) {
    container.innerHTML = '<span style="font-size:0.78rem;color:var(--text3)">目前沒有可用優惠券</span>';
    return;
  }
  container.innerHTML = COUPONS.map((c, i) => `
    <div class="filter-chip ${_selectedCoupon === c ? 'active' : ''}"
         onclick="selectCreateCoupon(${i})"
         style="border:1px dashed rgba(0,0,0,0.2)">
      🎟 ${c.discount}
    </div>`).join('');
}

function selectCreateCoupon(idx) {
  _selectedCoupon = (_selectedCoupon === COUPONS[idx]) ? null : COUPONS[idx];
  renderCreateCoupons();
  updateCreateFarePreview();
}

function openCreateInstant() {
  // 重設表單，地圖若已選目的地則預填
  _createMinutes  = 0;
  _createSeats    = 4;
  _createFare     = _lastMapDest.fare;
  _selectedCoupon = null;
  document.getElementById('createDest').value = _lastMapDest.name;
  renderCreateCoupons();
  updateCreateFarePreview();
  // 重設 chip 狀態
  ['ct-now','ct-5','ct-10','ct-15'].forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById('ct-now').classList.add('active');
  ['cs-2','cs-4'].forEach(id => document.getElementById(id).classList.remove('active'));
  document.getElementById('cs-4').classList.add('active');
  // 開啟 modal（先顯示，再初始化 Autocomplete，確保元素可見）
  document.getElementById('createInstantModal').classList.add('open');
  // 延遲初始化 Places Autocomplete（只做一次）
  if (!placesAutoCreate) {
    placesAutoCreate = new google.maps.places.Autocomplete(
      document.getElementById('createDest'),
      { componentRestrictions: { country: 'tw' }, fields: ['name', 'formatted_address', 'geometry'] }
    );
    placesAutoCreate.addListener('place_changed', () => {
      const place = placesAutoCreate.getPlace();
      if (!place) return;
      const name = place.name || place.formatted_address || document.getElementById('createDest').value;
      document.getElementById('createDest').value = name;
      _createFare = 0;
      updateCreateFarePreview();

      if (place.geometry && place.geometry.location && directionsService) {
        // 用 DirectionsService 算實際行車距離 → 估總車資
        directionsService.route({
          origin: NCU,
          destination: place.geometry.location,
          travelMode: google.maps.TravelMode.DRIVING,
        }, (result, status) => {
          if (status === 'OK') {
            const distKm = result.routes[0].legs[0].distance.value / 1000;
            _createFare  = Math.round(distKm * 18 + 60);
          } else {
            // DirectionsService 失敗時用直線距離估算
            const loc = place.geometry.location;
            const dx  = (loc.lat() - NCU.lat) * 111;
            const dy  = (loc.lng() - NCU.lng) * 111 * Math.cos(NCU.lat * Math.PI / 180);
            _createFare = Math.max(60, Math.round(Math.sqrt(dx*dx + dy*dy) * 18 + 60));
          }
          updateCreateFarePreview();
        });
      } else {
        // 沒有 geometry 時用 geocoder 查座標再估算
        geocoder.geocode({ address: name + ', 桃園市', region: 'TW' }, (res, st) => {
          if (st === 'OK' && res[0]) {
            const loc = res[0].geometry.location;
            const dx  = (loc.lat() - NCU.lat) * 111;
            const dy  = (loc.lng() - NCU.lng) * 111 * Math.cos(NCU.lat * Math.PI / 180);
            _createFare = Math.max(60, Math.round(Math.sqrt(dx*dx + dy*dy) * 18 + 60));
            updateCreateFarePreview();
          }
        });
      }
    });
  }
}

function closeCreateModal() {
  document.getElementById('createInstantModal').classList.remove('open');
}

function selectCreateTime(el, label, minutes) {
  ['ct-now','ct-5','ct-10','ct-15'].forEach(id => document.getElementById(id).classList.remove('active'));
  el.classList.add('active');
  _createMinutes = minutes;
}

function selectCreateSeats(el, n) {
  ['cs-2','cs-4'].forEach(id => document.getElementById(id).classList.remove('active'));
  el.classList.add('active');
  _createSeats = n;
  updateCreateFarePreview();
}

function createInstantRide() {
  if (!currentUser) { showToast('⚠️ 請先登入'); return; }
  const dest = document.getElementById('createDest').value.trim();
  if (!dest) { showToast('⚠️ 請輸入目的地'); return; }

  const now = new Date();
  now.setMinutes(now.getMinutes() + _createMinutes);
  const timeLabel = _createMinutes === 0
    ? '現在出發'
    : `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} 出發`;

  if (!_createFare) { showToast('⚠️ 請選擇目的地以估算車資'); return; }

  const discountVal  = _selectedCoupon ? parseCouponValue(_selectedCoupon.discount) : 0;
  const finalFare    = Math.max(0, _createFare - discountVal);

  const initial = (currentUser.displayName || '?')[0];
  const newRide = {
    id: 'ride_' + Date.now(),
    from: '中央大學 正門',
    to: dest,
    time: timeLabel,
    people: 1,
    max: _createSeats,
    fare: finalFare,
    category: 'other',
    scheduled: false,
    members: [initial],
    memberUids: [currentUser.uid],
    countdown: _createMinutes > 0 ? _createMinutes * 60 : 0,
  };

  // 消耗優惠券
  if (_selectedCoupon) {
    const idx = COUPONS.indexOf(_selectedCoupon);
    if (idx !== -1) COUPONS.splice(idx, 1);
    _selectedCoupon = null;
    renderCoupons();
  }

  RIDES.unshift(newRide);
  renderRides(currentFilter);
  renderChatRooms();
  closeCreateModal();
  const toastMsg = discountVal > 0
    ? `✅ 揪團建立成功！已折抵 $${discountVal}`
    : '✅ 揪團建立成功！等待夥伴加入';
  showToast(toastMsg);
  setTimeout(() => { switchPage('chat'); openChat(newRide.id); }, 800);
}

function createBooking() {
  const dest = document.getElementById('schedDest').value.trim();
  const date = document.getElementById('schedDate').value;
  const time = document.getElementById('schedTime').value;
  if (!dest) { showToast('⚠️ 請輸入目的地'); return; }
  const initial = (currentUser.displayName || '?')[0];
  const newRide = {
    id: 'ride_' + Date.now(),
    from: '中央大學 正門',
    to: dest,
    time: `${date.split('-').slice(1).join('/')} ${time}`,
    people: 1, max: 4, fare: 200,
    category: 'station', scheduled: true,
    members: [initial],
    memberUids: [currentUser.uid],
    countdown: 0,
  };
  SCHED_RIDES.unshift(newRide);
  renderSchedRides();
  renderChatRooms();
  document.getElementById('schedDest').value = '';
  showToast('📅 預約成功！等待其他人加入');
}

/* ══════════════════════════════════════
   CHAT
══════════════════════════════════════ */
function renderChatRooms() {
  const container = document.getElementById('chatRooms');
  const all = [...RIDES, ...SCHED_RIDES];
  if (all.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text3);padding:40px 16px">暫無共乘聊天室</div>';
    return;
  }
  container.innerHTML = all.map(r => `
    <div class="chat-room-item" onclick="openChat('${r.id}')">
      <div class="chat-av">🚗</div>
      <div class="chat-info">
        <div class="chat-name">${r.to}</div>
        <div class="chat-preview">${r.time} · ${r.people}/${r.max}人</div>
      </div>
      <div class="chat-time">${r.people}/${r.max}</div>
    </div>
  `).join('');
}

function openChat(id) {
  const r = [...RIDES, ...SCHED_RIDES].find(x => x.id === id);
  currentChatId = id;
  document.getElementById('chatWindowName').textContent  = r ? `${r.from.split(' ').pop()} → ${r.to}` : '聊天室';
  document.getElementById('chatWindowSub').textContent   = r ? r.time : '';
  document.getElementById('chatPeopleCount').textContent = r ? `👥 ${r.people}/${r.max} 人` : '';
  document.getElementById('chatWindow').classList.add('open');

  currentRealMsgs = localChatHistory[id] || [];
  renderMessages(mergeMsgs(currentRealMsgs, []));
  if (r) startBotSimulation(r);
}

function renderMessages(msgs) {
  const container = document.getElementById('chatMessages');
  if (msgs.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--text3);font-size:0.75rem;padding:24px">還沒有人說話，來打個招呼吧！👋</div>';
    return;
  }
  container.innerHTML = msgs.map(m => {
    if (m.system) return `<div class="system-msg">${escHtml(m.text)}</div>`;
    const isMe    = currentUser && m.senderId === currentUser.uid;
    const initial = (m.senderName || '?')[0];
    const t       = fmtTime(m.timestamp);
    if (isMe) return `
      <div class="msg-row mine">
        <div>
          <div class="msg-bubble">${escHtml(m.text)}</div>
          <div style="font-size:0.6rem;color:var(--text3);text-align:right;margin-top:2px">${t}</div>
        </div>
      </div>`;
    return `
      <div class="msg-row">
        <div class="msg-av-sm" style="background:#555;color:#fff">${initial}</div>
        <div>
          <div style="font-size:0.65rem;color:var(--text3);margin-bottom:3px">${escHtml(m.senderName||'')}</div>
          <div class="msg-bubble">${escHtml(m.text)}</div>
          <div style="font-size:0.6rem;color:var(--text3);margin-top:2px">${t}</div>
        </div>
      </div>`;
  }).join('');
  setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

function escHtml(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

function sendMsg() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text || !currentChatId || !currentUser) return;
  input.value = '';
  const msg = {
    text,
    senderId:   currentUser.uid,
    senderName: currentUser.displayName || '使用者',
    system:     false,
    timestamp:  { toDate: () => new Date() }
  };
  if (!localChatHistory[currentChatId]) localChatHistory[currentChatId] = [];
  localChatHistory[currentChatId].push(msg);
  currentRealMsgs = localChatHistory[currentChatId];
  renderMessages(mergeMsgs(currentRealMsgs, localBotMsgs));
}

function closeChat() {
  document.getElementById('chatWindow').classList.remove('open');
  if (msgsUnsubscribe) { msgsUnsubscribe(); msgsUnsubscribe = null; }
  clearBotTimers();
  currentChatId   = null;
  currentRealMsgs = [];
}

/* ══════════════════════════════════════
   BOT SIMULATION
══════════════════════════════════════ */
const BOT_POOLS = {
  station: [
    ['王同學', '大家好！我在宿舍區，出發前叫我一聲 🚂'],
    ['林小姐', '好的，我快到正門了！'],
    ['陳同學', '高鐵還是台鐵？'],
    ['王同學', '台鐵，班次多比較方便'],
    ['林小姐', '了解，那我快點！'],
  ],
  mall: [
    ['李同學', '我也要去！一起共乘省好多 🛍️'],
    ['張小姐', '大概幾點回程？'],
    ['李同學', '我預計逛到下午四點左右'],
    ['張小姐', '好，那我跟你一起回 👍'],
  ],
  airport: [
    ['吳同學', '我有兩件行李，沒問題吧？✈️'],
    ['周先生', '沒問題！後車廂夠大'],
    ['吳同學', '太好了，我航班是晚上八點'],
    ['周先生', 'ok，出發前半小時提醒大家'],
  ],
  default: [
    ['成員A', '我準備好了！'],
    ['成員B', '快到集合點了'],
    ['成員A', '👍'],
  ]
};

function clearBotTimers() {
  botTimers.forEach(t => clearTimeout(t));
  botTimers    = [];
  localBotMsgs = [];
}

function startBotSimulation(ride) {
  clearBotTimers();
  const pool = BOT_POOLS[ride.category] || BOT_POOLS.default;
  if (!ride.members || ride.members.length < 1) return;
  let delay = 1800;
  pool.forEach(([name, text], i) => {
    const t = setTimeout(() => {
      if (!currentChatId) return;
      localBotMsgs.push({
        text,
        senderName: name,
        senderId:   'bot_' + i,
        system:     false,
        timestamp:  { toDate: () => new Date() }
      });
      renderMessages(mergeMsgs(currentRealMsgs, localBotMsgs));
    }, delay);
    delay += Math.random() * 4000 + 2500;
    botTimers.push(t);
  });
}

function mergeMsgs(real, bots) {
  return [...real, ...bots].sort((a, b) => {
    const ta = a.timestamp ? (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)) : new Date(0);
    const tb = b.timestamp ? (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)) : new Date(0);
    return ta - tb;
  });
}

/* ══════════════════════════════════════
   PROFILE DATA（靜態範例，可日後接 Firestore）
══════════════════════════════════════ */
const POINTS_HISTORY = [
  { icon:'🎁', desc:'新用戶獎勵', amount:+50, date:'' },
  { icon:'🚗', desc:'完成共乘（中大→中壢站）', amount:+10, date:'' },
  { icon:'👥', desc:'分享好友', amount:+20, date:'' },
  { icon:'🎟', desc:'兌換折價券 -$20', amount:-20, date:'' },
];
const HISTORY_DATA = [
  { route:'中大 → 中壢火車站', date:'2024/03/20 18:05', fare:'$45', pts:'+10' },
  { route:'中大 → SOGO 百貨',  date:'2024/03/18 14:30', fare:'$38', pts:'+10' },
  { route:'中大 → 桃園機場',   date:'2024/03/15 09:00', fare:'$138',pts:'+10' },
];
const COUPONS = [
  { discount:'-$20', desc:'車資折扣券', exp:'效期至 04/30' },
  { discount:'-$50', desc:'好友分享獎勵', exp:'效期至 05/15' },
];

function renderPointsList() {
  document.getElementById('pointsList').innerHTML = POINTS_HISTORY.map(p => `
    <div class="points-row">
      <div class="points-icon">${p.icon}</div>
      <div class="points-desc"><div style="font-size:0.8rem">${p.desc}</div></div>
      <div class="points-amount ${p.amount > 0 ? 'plus' : 'minus'}">${p.amount > 0 ? '+' : ''}${p.amount}</div>
    </div>`).join('');
}
function renderCoupons() {
  document.getElementById('couponsGrid').innerHTML = COUPONS.map(c => `
    <div class="coupon-card" onclick="showToast('已選擇優惠券 ${c.discount}')">
      <span class="coupon-discount">${c.discount}</span>
      <div class="coupon-desc">${c.desc}</div>
      <div class="coupon-exp">${c.exp}</div>
    </div>`).join('');
}
function renderHistory() {
  document.getElementById('historyList').innerHTML = HISTORY_DATA.map(h => `
    <div class="history-item">
      <div class="history-icon">🚗</div>
      <div class="history-info">
        <div class="history-route">${h.route}</div>
        <div class="history-date">${h.date}</div>
      </div>
      <div class="history-right">
        <div class="history-fare">${h.fare}</div>
        <div class="history-pts" style="color:var(--accent)">${h.pts}點</div>
      </div>
    </div>`).join('');
}

/* ══════════════════════════════════════
   COUNTDOWN
══════════════════════════════════════ */
function startCountdowns() {
  setInterval(() => {
    RIDES.forEach(r => { if ((r.countdown||0) > 0) r.countdown--; });
    if (currentPage === 'home' && currentMode === 'instant') {
      const filtered = currentFilter === 'all' ? RIDES : RIDES.filter(r => r.category === currentFilter);
      document.querySelectorAll('.countdown').forEach((el, i) => {
        if (filtered[i]) el.innerHTML = `🕐 ${filtered[i].countdown||0}分`;
      });
    }
  }, 60000);
}

/* ══════════════════════════════════════
   TOAST
══════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ══════════════════════════════════════
   CLOSE MODAL ON OVERLAY CLICK
══════════════════════════════════════ */
document.getElementById('joinModal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

