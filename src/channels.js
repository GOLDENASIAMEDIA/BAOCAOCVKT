// Danh sách kênh hệ thống Golden Asia MẶC ĐỊNH — dùng làm giá trị khởi tạo/fallback.
// Danh sách THẬT SỰ dùng trong app giờ tùy biến được qua Cài đặt (settings.channels, quản lý
// trong AdminSettings) — các màn hình nên đọc từ đó, chỉ fallback về danh sách này khi
// chưa cấu hình gì (cài đặt mới/trống).
export const DEFAULT_GOLDEN_CHANNELS = [
  { key: 'UNI', title: 'University (Trường học)' },
  { key: 'CF', title: 'F&B (Coffee & Dining)' },
  { key: 'SALON', title: 'Beauty (Salon & Spa)' },
  { key: 'BUILDING', title: 'Building (Tòa nhà)' },
  { key: 'FF', title: 'Fast Food (Cửa hàng ăn nhanh)' },
  { key: 'MALL', title: 'Supermarket & Mall' }
];

// Giữ lại tên cũ để tương thích ngược nếu còn chỗ nào import trực tiếp
export const GOLDEN_CHANNELS = DEFAULT_GOLDEN_CHANNELS;

// Dựng map { key: title } từ 1 danh sách kênh bất kỳ (mặc định hoặc tùy biến từ settings)
export const buildChannelLabels = (channels) =>
  (channels && channels.length > 0 ? channels : DEFAULT_GOLDEN_CHANNELS).reduce(
    (m, c) => { m[c.key] = c.title; return m; },
    { ALL: 'Chung' }
  );

export const CHANNEL_LABELS = buildChannelLabels(DEFAULT_GOLDEN_CHANNELS);

// Tìm hạng mục DP LCD trong danh sách categories (tên có thể chứa khoảng trắng thừa)
export const findDpCategory = (categories) =>
  (categories || []).find(c => c.toLowerCase().includes('dp lcd')) || null;

export const normalizeCategory = (cat) => {
  if (!cat) return '';
  return cat.toLowerCase().replace(/\s+/g, ' ').trim();
};

export const isDpCategory = (cat, dpCategoryName) => {
  if (!cat) return false;
  if (dpCategoryName) {
    return normalizeCategory(cat) === normalizeCategory(dpCategoryName);
  }
  return normalizeCategory(cat).includes('dp lcd');
};

// Tìm hạng mục "Tiến độ GP" — khớp tên có chứa "gp" nhưng KHÔNG phải "Tháo GP" (khác ý nghĩa,
// không theo dõi lũy kế theo tuần như "Tiến độ GP"). Giữ lại làm fallback tương thích ngược
// cho các cấu hình CHƯA khai báo categoryTypes tường minh — xem getCategoryType() bên dưới.
export const findGpCategory = (categories) =>
  (categories || []).find(c => {
    const lc = c.toLowerCase();
    return lc.includes('gp') && !lc.includes('tháo');
  }) || null;

// ─── Kiểu nhập liệu tùy biến theo hạng mục (thay cho code cứng theo TÊN hạng mục) ──────────
// Admin cấu hình trong Cài đặt: mỗi hạng mục có thể là 'normal' (KH/TT thường), 'channel'
// (nhập theo từng kênh hệ thống Golden, giống DP LCD nhưng KHÔNG áp dụng cửa sổ nhập/lý do trễ
// hạn riêng của DP LCD), hoặc 'weekly_cumulative' (khai Tổng số 1 lần đầu tuần + cập nhật Đã
// hoàn thành lũy kế mỗi ngày, giống "Tiến độ GP"). Hạng mục chưa cấu hình sẽ mặc định 'normal',
// TRỪ khi tên khớp heuristic "Tiến độ GP" cũ (để không phá vỡ dữ liệu/cấu hình có sẵn trước khi
// tính năng này tồn tại).
export const getCategoryType = (categoryTypes, category, allCategories) => {
  if (!category) return 'normal';
  const explicit = categoryTypes?.[category];
  if (explicit) return explicit;
  if (findGpCategory(allCategories || [category]) === category) return 'weekly_cumulative';
  return 'normal';
};

// Tiền tố lưu "lý do chưa hoàn thành đúng hạn" chung vào trường notes của báo cáo DP LCD —
// dùng chung giữa form nhập (tách lý do ra khi sửa) và màn hình admin (lọc/đánh dấu báo cáo có lý do)
export const DP_REASON_PREFIX = 'Lý do chưa hoàn thành đúng hạn: ';
export const hasDpReason = (notes) => !!notes && notes.startsWith(DP_REASON_PREFIX);

// ─── Tính số tuần tự động theo chu kỳ ─────────────────────────────────────────
// weekStartDay: 0=CN, 1=Thứ 2, ... 6=Thứ 7 (mặc định 1 = Thứ 2, đúng quy trình hiện tại)
// Quy tắc: 2 ngày cuối cùng ngay TRƯỚC ngày bắt đầu chu kỳ (VD Thứ 7 & CN khi chu kỳ bắt đầu Thứ 2)
// sẽ được tự động tính vào tuần SẮP TỚI (tuần của ngày bắt đầu kế tiếp), vì kỹ thuật thường
// đi chuẩn bị/thay chương trình DP LCD vào 2 ngày cuối tuần cho tuần làm việc sắp tới.
export const computeWeekNumber = (dateStr, weekStartDay = 1) => {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;

  const dow = d.getDay();
  const daysSinceStart = (dow - weekStartDay + 7) % 7;
  const rollForward = daysSinceStart >= 5; // 2 ngày cuối chu kỳ → đẩy sang tuần kế tiếp
  const cycleStart = new Date(d);
  cycleStart.setDate(d.getDate() - daysSinceStart + (rollForward ? 7 : 0));

  // Đánh số tuần theo kiểu ISO-8601 (ổn định qua các năm), áp dụng trên ngày bắt đầu chu kỳ
  const shifted = new Date(cycleStart);
  shifted.setDate(shifted.getDate() + 3);
  const jan4 = new Date(shifted.getFullYear(), 0, 4);
  const jan4Dow = (jan4.getDay() + 6) % 7;
  const isoWeek1Start = new Date(jan4);
  isoWeek1Start.setDate(jan4.getDate() - jan4Dow);
  const diffDays = Math.round((shifted - isoWeek1Start) / 86400000);
  return Math.floor(diffDays / 7) + 1;
};

// ─── "YYYY-MM-DD" theo giờ ĐỊA PHƯƠNG của trình duyệt (không dùng Date.toISOString()) ──────
// toISOString() quy đổi sang giờ UTC, nên vào các giờ đầu ngày ở múi giờ dương như Việt Nam
// (UTC+7, 00:00–06:59 giờ VN vẫn còn là NGÀY HÔM TRƯỚC theo UTC) sẽ bị lệch mất 1 ngày —
// gây ra lỗi "Hôm nay" hiển thị sai thứ trong lịch tuần. Luôn dùng hàm này để lấy ngày hôm nay/
// ngày của 1 Date bất kỳ theo đúng lịch mà người dùng đang nhìn thấy trên máy của họ.
export const toLocalIsoDate = (d = new Date()) => {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

// Số tuần hiện tại (hôm nay), theo cùng chu kỳ đã cấu hình
export const getCurrentWeekNumber = (weekStartDay = 1) => {
  const iso = toLocalIsoDate();
  return computeWeekNumber(iso, weekStartDay);
};

// ─── Nhãn thứ trong tuần & cửa sổ nhập DP LCD (tự dịch theo weekStartDay) ────────────
export const WEEKDAY_LABELS = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
export const dayLabel = (v) => WEEKDAY_LABELS[((v % 7) + 7) % 7];

// 4 ngày được phép nhập DP LCD trong 1 chu kỳ: 2 ngày cuối chu kỳ trước (tự động rơi vào tuần kế tiếp,
// xem computeWeekNumber) + ngày bắt đầu chu kỳ + 1 ngày kế tiếp. VD weekStartDay=1 (Thứ 2) → Thứ 7, CN, Thứ 2, Thứ 3.
export const getDpEntryDows = (weekStartDay = 1) => [
  (weekStartDay + 5) % 7,
  (weekStartDay + 6) % 7,
  weekStartDay % 7,
  (weekStartDay + 1) % 7
];

// 3 ngày còn lại của chu kỳ — nếu DP LCD chưa nhập đủ vị trí thì coi là "quá hạn"
export const getDpOverdueDows = (weekStartDay = 1) => [
  (weekStartDay + 2) % 7,
  (weekStartDay + 3) % 7,
  (weekStartDay + 4) % 7
];

export const isDpOverdueDow = (dow, weekStartDay = 1) => getDpOverdueDows(weekStartDay).includes(dow);

// Chuỗi mô tả cửa sổ nhập, dùng cho banner/thông báo, VD "Thứ 7, Chủ nhật, Thứ 2, Thứ 3" hoặc "Thứ 7→Thứ 3"
export const formatDpEntryWindow = (weekStartDay = 1, style = 'list') => {
  const dows = getDpEntryDows(weekStartDay);
  if (style === 'range') return `${dayLabel(dows[0])}→${dayLabel(dows[dows.length - 1])}`;
  return dows.map(dayLabel).join(', ');
};

// ─── Định dạng ngày đầy đủ (dùng chung cho form báo cáo, lịch mẫu tuần, lịch sử...) ──────
// "Thứ X, DD/MM/YYYY" — giúp nhìn rõ kế hoạch/báo cáo là của ngày cụ thể nào, không chỉ chung chung.
export const formatFullDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dayLabel(d.getDay())}, ${dd}/${mm}/${d.getFullYear()}`;
};

export const formatShortDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

// Ngày cụ thể (YYYY-MM-DD) ứng với mỗi THỨ (0=CN..6=T7) trong chu kỳ tuần ĐANG DIỄN RA (chứa hôm nay) —
// dùng để hiện ngày tháng năm tham chiếu cụ thể cho Lịch mẫu tuần (vốn lặp lại hàng tuần theo thứ,
// không gắn với 1 ngày cố định), giúp admin hình dung rõ áp dụng cho ngày nào của tuần này.
export const getCycleDatesByDow = (weekStartDay = 1) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDow = today.getDay();
  const daysSinceStart = (todayDow - weekStartDay + 7) % 7;
  const rollForward = daysSinceStart >= 5;
  const cycleStart = new Date(today);
  cycleStart.setDate(today.getDate() - daysSinceStart + (rollForward ? 7 : 0));
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const map = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(cycleStart);
    d.setDate(cycleStart.getDate() + i);
    map[d.getDay()] = iso(d);
  }
  return map;
};

// Khoảng ngày của 1 tuần (Thứ 2 → Chủ nhật). offset = 0: tuần này, -1: tuần trước
export const getWeekRange = (offset = 0) => {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 0 = Thứ 2
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: iso(monday), end: iso(sunday) };
};
