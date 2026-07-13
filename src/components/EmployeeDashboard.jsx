import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { DEFAULT_GOLDEN_CHANNELS, buildChannelLabels, findDpCategory, getCategoryType, computeWeekNumber, DP_REASON_PREFIX, isDpOverdueDow, formatDpEntryWindow, dayLabel, formatFullDate, getCycleDatesByDow, formatShortDate, toLocalIsoDate } from '../channels';
import {
  PlusCircle, Edit, Trash2, FileText, CheckCircle, Clock, MapPin, Monitor,
  Copy, Pin, ClipboardCheck, Tv, ChevronDown, ChevronUp,
  ListChecks, Search, X
} from 'lucide-react';

// ─── Lý do trễ hạn DP LCD được lưu chung vào "notes" với tiền tố cố định (DP_REASON_PREFIX,
// dùng chung với màn hình admin) — tách ra khi mở lại báo cáo để sửa, tránh chồng lặp lý do ──
const parseDpNotes = (raw) => {
  if (!raw || !raw.startsWith(DP_REASON_PREFIX)) return { reasonLate: '', notes: raw || '' };
  const rest = raw.slice(DP_REASON_PREFIX.length);
  const sepIdx = rest.indexOf(' | ');
  return sepIdx === -1
    ? { reasonLate: rest, notes: '' }
    : { reasonLate: rest.slice(0, sepIdx), notes: rest.slice(sepIdx + 3) };
};

const formatMonthTitle = (monthKey) => {
  if (!monthKey || monthKey === '—') return 'Khác';
  const [year, month] = monthKey.split('-');
  return `Tháng ${month}/${year}`;
};

// ─── Đánh giá tiến độ: chọn nhanh bằng chip thay vì dropdown ──────────────────
const PROGRESS_OPTIONS = [
  { value: 'Hoàn thành', badge: 'badge-success' },
  { value: 'Đang thực hiện', badge: 'badge-info' },
  { value: 'Chưa bắt đầu', badge: 'badge-warning' },
  { value: 'Cần hỗ trợ', badge: 'badge-danger' },
  { value: 'Trễ hạn', badge: 'badge-danger' },
];

// ─── Khối form có thể thu gọn — giảm chiều dài form, đỡ phải cuộn ─────────────
function FormSection({ title, icon: Icon, open, onToggle, accent = 'var(--accent-color)', children }) {
  return (
    <div className="form-section">
      <button type="button" className="form-section-header" onClick={onToggle} style={{ color: accent }}>
        <span className="form-section-title">
          {Icon && <Icon size={15} />} {title}
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="form-section-body">{children}</div>}
    </div>
  );
}

export default function EmployeeDashboard({ user }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Settings State
  const [sysSettings, setSysSettings] = useState({ categories: [], fields: [], weekStartDay: 1 });

  // Form State
  const [editingId, setEditingId] = useState(null);
  const [date, setDate] = useState(toLocalIsoDate());
  // Tuần được TỰ ĐỘNG tính từ ngày báo cáo (không nhập tay) — theo chu kỳ tuần admin cấu hình.
  // 2 ngày cuối chu kỳ (mặc định Thứ 7 & CN) tự tính vào tuần kế tiếp.
  const week = useMemo(
    () => computeWeekNumber(date, sysSettings.weekStartDay ?? 1),
    [date, sysSettings.weekStartDay]
  );
  const [taskDetail, setTaskDetail] = useState('');
  const [customTaskDetail, setCustomTaskDetail] = useState('');
  const [planLocations, setPlanLocations] = useState('');
  const [planScreens, setPlanScreens] = useState('');
  const [planDetails, setPlanDetails] = useState('');
  const [actualLocations, setActualLocations] = useState('');
  const [actualScreens, setActualScreens] = useState('');
  const [actualDetails, setActualDetails] = useState('');
  const [progressEval, setProgressEval] = useState('Hoàn thành');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [customData, setCustomData] = useState({});
  const [defaults, setDefaults] = useState({});
  const [assignments, setAssignments] = useState([]);
  // Người được bàn giao/tiếp nhận công việc kế tiếp (tuỳ chọn) — khớp cột "List nhân viên" trong Excel gốc
  const [handoverTo, setHandoverTo] = useState('');
  const [colleagues, setColleagues] = useState([]);
  // Nhập nhanh số liệu DP LCD theo từng kênh hệ thống Golden — { [channelKey]: { planLocations, planScreens, actualLocations, actualScreens } }
  const [dpRows, setDpRows] = useState({});
  const updateDpRow = (channelKey, field, value) => {
    // Không cho số địa điểm đã hoàn thành là số âm (chặn cả trường hợp gõ tay "-1", không chỉ dựa vào min trên input)
    if (field === 'actualLocations' && value !== '' && value != null && parseInt(value) < 0) {
      value = '0';
    }
    setDpRows(prev => ({ ...prev, [channelKey]: { ...prev[channelKey], [field]: value } }));
  };

  // Thu gọn/mở rộng từng khối của form — giúp form ngắn gọn, đỡ phải cuộn
  const [openSections, setOpenSections] = useState({ actual: true, eval: true });
  const toggleSection = (key) => setOpenSections(s => ({ ...s, [key]: !s[key] }));

  // Tìm kiếm / lọc nhanh lịch sử báo cáo đã gửi
  const [historySearch, setHistorySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all'); // all | needsActual
  const [expandedMonths, setExpandedMonths] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});
  
  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };
  const toggleWeek = (weekKey) => {
    setExpandedWeeks(prev => ({ ...prev, [weekKey]: !prev[weekKey] }));
  };

  // Hạng mục DP LCD (báo cáo theo kênh hệ thống Golden) — vẫn dùng cơ chế riêng (cửa sổ nhập,
  // lý do trễ hạn, reset theo tuần), khớp theo TÊN như trước, không đổi được qua Cài đặt.
  const dpCategory = findDpCategory(sysSettings.categories);
  const isDpTask = !!dpCategory && taskDetail === dpCategory;
  // Kiểu nhập liệu của hạng mục ĐANG CHỌN — admin cấu hình trong Cài đặt (Hạng mục công việc):
  // 'normal' (KH/TT thường), 'channel' (theo từng kênh, không có cửa sổ/lý do trễ hạn như DP LCD),
  // 'weekly_cumulative' (khai Tổng số 1 lần đầu tuần + cập nhật Đã hoàn thành mỗi ngày, như "Tiến độ GP").
  // Không code cứng theo TÊN hạng mục nữa (trừ DP LCD ở trên, và fallback tương thích ngược cho
  // "Tiến độ GP" bên trong getCategoryType khi admin chưa cấu hình gì).
  const categoryType = isDpTask ? 'dp_lcd' : getCategoryType(sysSettings.categoryTypes, taskDetail, sysSettings.categories);
  const isWeeklyCumulativeTask = categoryType === 'weekly_cumulative';
  const isChannelTask = categoryType === 'channel';
  // Danh sách kênh hệ thống Golden — tùy biến trong Cài đặt (Admin), fallback về mặc định nếu chưa cấu hình
  const channels = sysSettings.channels?.length > 0 ? sysSettings.channels : DEFAULT_GOLDEN_CHANNELS;
  const channelLabels = useMemo(() => buildChannelLabels(channels), [channels]);

  // Tiến độ DP LCD phải nhập xong trong 4 ngày đầu chu kỳ (mặc định Thứ 7, CN, Thứ 2, Thứ 3
  // khi chu kỳ bắt đầu Thứ 2) — qua 3 ngày còn lại mà vẫn chưa đủ vị trí thì bắt buộc nêu lý do.
  // Cửa sổ nhập/hạn chót TỰ DỊCH theo "Ngày bắt đầu chu kỳ" cấu hình trong Cài đặt (weekStartDay),
  // không còn cứng Thứ 2 nữa.
  // Tính theo NGÀY CỦA BÁO CÁO (trường "date" đang chọn), không phải ngày hôm nay thực tế —
  // để sửa báo cáo cũ hoặc lập kế hoạch tuần tới không bị đòi lý do oan.
  const weekStartDay = sysSettings.weekStartDay ?? 1;
  const reportDow = date ? new Date(date + 'T00:00:00').getDay() : new Date().getDay(); // 0=CN,1=T2,2=T3,3=T4,4=T5,5=T6,6=T7
  const isPastDpDeadline = isDpOverdueDow(reportDow, weekStartDay);
  const dpEntryWindowText = formatDpEntryWindow(weekStartDay, 'list');
  const dpEntryWindowRange = formatDpEntryWindow(weekStartDay, 'range');

  // ── Dải chọn nhanh theo THỨ trong tuần đang diễn ra — bấm vào 1 thứ để chọn luôn ngày báo cáo ──
  // đó (khỏi phải mở lịch), thứ tự hiển thị bắt đầu từ "Ngày bắt đầu chu kỳ" đã cấu hình (giống
  // lịch mẫu tuần bên Cài đặt), kèm chấm xanh báo đã có báo cáo cho ngày đó.
  const todayIso = toLocalIsoDate();
  const weekStripDates = useMemo(() => getCycleDatesByDow(weekStartDay), [weekStartDay]);
  const weekStripDows = useMemo(
    () => Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7),
    [weekStartDay]
  );
  const reportCountByDate = useMemo(() => {
    const m = {};
    reports.forEach(r => { m[r.date] = (m[r.date] || 0) + 1; });
    return m;
  }, [reports]);

  // Ngày đang chọn có nằm ở TƯƠNG LAI (sau hôm nay) hay không — dùng để gợi ý: ngày tương lai chỉ
  // nên dùng để lập Kế hoạch dự kiến trước, còn Tiến độ thực tế phải đợi đến đúng ngày/qua ngày đó mới nhập.
  const isFutureDate = !!date && date > todayIso;

  // Lịch mẫu kế hoạch theo tuần do admin đặt (Cài đặt) cho đúng THỨ của "Ngày báo cáo" đang chọn
  const weeklyTemplateEntry = sysSettings.weeklyTemplate?.[reportDow] || null;
  const templateAppliedToday = !editingId && !!weeklyTemplateEntry?.task_detail;

  useEffect(() => {
    fetchData();
  }, [user.id]);

  // Tự động điền "Kế hoạch dự kiến" theo Lịch mẫu tuần do admin đặt, dựa theo THỨ của ngày báo cáo
  // đang chọn — chỉ áp dụng khi đang TẠO báo cáo mới (không đụng vào báo cáo đang sửa dở).
  // Ngày nào admin chưa đặt lịch mẫu thì giữ nguyên hành vi cũ (nhân viên tự nhập / dùng mặc định của mình).
  useEffect(() => {
    if (editingId) return;
    const entry = sysSettings.weeklyTemplate?.[reportDow];
    if (!entry || !entry.task_detail) return;
    if (sysSettings.categories?.includes(entry.task_detail)) {
      setTaskDetail(entry.task_detail);
      setCustomTaskDetail('');
    } else {
      setTaskDetail('Khác');
      setCustomTaskDetail(entry.task_detail);
    }
    setPlanLocations(entry.plan_locations ?? '');
    setPlanScreens(entry.plan_screens ?? '');
    if (entry.plan_details) setPlanDetails(entry.plan_details);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, sysSettings.weeklyTemplate, editingId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reportsRes, settingsRes, defaultsRes, asgRes, profilesRes] = await Promise.all([
        db.reports.getByUser(user.id),
        db.settings.get(),
        db.profiles.getDefaults(user.id),
        db.assignments.getByUser(user.id),
        db.profiles.getAll()
      ]);
      setAssignments(asgRes?.data || []);
      setColleagues((profilesRes?.data || []).filter(p => p.id !== user.id));
      if (reportsRes.error) throw reportsRes.error;
      if (settingsRes.error) throw settingsRes.error;

      setReports(reportsRes.data || []);

      const stgs = settingsRes.data || { categories: [], fields: [] };
      setSysSettings(stgs);

      // Auto-fill form theo thiết lập mặc định của nhân viên (tránh nhập lại)
      const defs = defaultsRes?.data || {};
      setDefaults(defs);
      applyDefaults(defs, stgs);
    } catch (err) {
      console.error(err);
      showMsg('Không thể tải dữ liệu!', 'danger');
    } finally {
      setLoading(false);
    }
  };

  // Điền sẵn phần Kế hoạch theo thiết lập mặc định của nhân viên
  const applyDefaults = (defs, stgs = sysSettings) => {
    if (defs.default_task) {
      if (stgs.categories?.includes(defs.default_task)) {
        setTaskDetail(defs.default_task);
        setCustomTaskDetail('');
      } else {
        setTaskDetail('Khác');
        setCustomTaskDetail(defs.default_task);
      }
    } else if (stgs.categories?.length > 0) {
      setTaskDetail(stgs.categories[0]);
    }
    setPlanLocations(defs.default_locations ?? '');
    setPlanScreens(defs.default_screens ?? '');
    setPlanDetails(defs.default_plan_details ?? '');
  };

  const fetchMyReports = async () => {
    try {
      const { data, error } = await db.reports.getByUser(user.id);
      if (!error) setReports(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const showMsg = (text, type) => {
    setMessage({ text, type });
    // Chỉ thông báo THÀNH CÔNG mới tự ẩn — thông báo LỖI giữ nguyên cho tới khi người dùng
    // đóng hoặc thao tác tiếp, tránh lỗi chặn gửi báo cáo mà không ai kịp đọc (mất sau 4s).
    if (type === 'success') {
      setTimeout(() => setMessage(m => (m.text === text ? { text: '', type: '' } : m)), 4000);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setDate(toLocalIsoDate());
    // Điền lại theo mặc định thay vì để trống
    applyDefaults(defaults);
    setDpRows({});
    setActualLocations('');
    setActualScreens('');
    setActualDetails('');
    setProgressEval('Hoàn thành');
    setNotes('');
    setCustomData({});
    setHandoverTo('');
  };

  // Lưu phần Kế hoạch hiện tại làm mặc định cho các lần báo cáo sau
  const handleSaveDefaults = async () => {
    const finalTask = taskDetail === 'Khác' ? customTaskDetail : taskDetail;
    const payload = {
      default_locations: planLocations !== '' ? parseInt(planLocations) : null,
      default_screens: planScreens !== '' ? parseInt(planScreens) : null,
      default_task: finalTask || null,
      default_plan_details: planDetails || null
    };
    const { error } = await db.profiles.updateDefaults(user.id, payload);
    if (error) {
      console.error(error);
      showMsg('Không thể lưu thiết lập mặc định!', 'danger');
    } else {
      setDefaults(payload);
      showMsg('Đã lưu làm mặc định! Từ nay form sẽ tự điền sẵn các giá trị này.', 'success');
    }
  };

  // Chép kế hoạch cũ: ưu tiên báo cáo của NGÀY LIỀN TRƯỚC ngày đang chọn, không có thì lấy
  // báo cáo gần nhất — gộp 2 nút sao chép làm 1, áp vào đúng ngày đang chọn trên dải tuần.
  const handleCopyLast = () => {
    const prevDate = new Date(date + 'T00:00:00');
    prevDate.setDate(prevDate.getDate() - 1);
    const prevIso = toLocalIsoDate(prevDate);
    const last = reports.find(r => r.date === prevIso) || reports[0];
    if (!last) return;
    setEditingId(null);
    if (sysSettings.categories?.includes(last.task_detail)) {
      setTaskDetail(last.task_detail);
      setCustomTaskDetail('');
    } else {
      setTaskDetail('Khác');
      setCustomTaskDetail(last.task_detail || '');
    }
    setPlanLocations(last.plan_locations ?? '');
    setPlanScreens(last.plan_screens ?? '');
    setPlanDetails(last.plan_details ?? '');
    // Nếu báo cáo gần nhất là DP LCD, chỉ cần dọn trống để nhập "đã hoàn thành" mới cho tuần này
    setDpRows({});
    setActualLocations('');
    setActualScreens('');
    setActualDetails('');
    setProgressEval('Đang thực hiện');
    setNotes('');
    setCustomData({});
    showMsg('Đã sao chép kế hoạch từ báo cáo gần nhất. Chỉ cần cập nhật và gửi!', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Báo cáo chỉ mới có Kế hoạch, chưa nhập Thực tế
  const needsActual = (r) =>
    r.actual_locations == null && r.actual_screens == null && !r.actual_details;

  // ── Trạng thái của từng NGÀY (dùng để tô màu chấm số trên dải chọn thứ) ────────────────
  // empty = chưa có báo cáo | done = đã có & xong hết | issue = có báo cáo "Cần hỗ trợ/Trễ hạn"
  // inprogress = có báo cáo nhưng còn thiếu Tiến độ thực tế hoặc đang thực hiện
  const reportsByDate = useMemo(() => {
    const m = {};
    reports.forEach(r => {
      if (!m[r.date]) m[r.date] = [];
      m[r.date].push(r);
    });
    return m;
  }, [reports]);

  const getDayStatus = (iso) => {
    const list = reportsByDate[iso];
    if (!list || list.length === 0) return 'empty';
    if (list.some(r => r.progress_eval === 'Cần hỗ trợ' || r.progress_eval === 'Trễ hạn')) return 'issue';
    if (list.some(r => needsActual(r) || r.progress_eval === 'Đang thực hiện' || r.progress_eval === 'Chưa bắt đầu')) return 'inprogress';
    return 'done';
  };

  const DAY_STATUS_COLOR = {
    empty: null,
    done: 'var(--success)',
    inprogress: 'var(--info)',
    issue: 'var(--danger)'
  };

  // ── Tiến độ tổng của TUẦN đang chọn (Đ.điểm + Màn hình, Kế hoạch so với Thực tế) ──────────
  const weekReportsForProgress = useMemo(
    () => reports.filter(r => parseInt(r.week) === parseInt(week)),
    [reports, week]
  );
  const weekPlanTotal = weekReportsForProgress.reduce((s, r) => s + (r.plan_locations || 0) + (r.plan_screens || 0), 0);
  const weekActualTotal = weekReportsForProgress.reduce((s, r) => s + (r.actual_locations || 0) + (r.actual_screens || 0), 0);
  const weekProgressPct = weekPlanTotal > 0
    ? Math.min(100, Math.round((weekActualTotal / weekPlanTotal) * 100))
    : (weekReportsForProgress.length > 0 ? 100 : 0);

  // ── Những ngày trong tuần (tính đến hôm nay) vẫn CHƯA có báo cáo nào — nhắc để khỏi bỏ sót ──
  const missingDaysThisWeek = weekStripDows
    .map(dow => weekStripDates[dow])
    .filter(iso => iso <= todayIso && !(reportsByDate[iso]?.length > 0));

  // ── Đồng bộ tiến độ DP LCD: cộng/trừ số địa điểm hoàn thành vào kênh ──
  // "Đã hoàn thành" được tính theo TUẦN — sang tuần mới sẽ tự reset về 0 thay vì cộng dồn mãi mãi.
  const adjustDpDone = async (channelKey, delta, weekForEntry) => {
    if (!dpCategory || !channelKey || !delta) return;
    try {
      // Lấy dữ liệu mới nhất để tránh ghi đè sai
      const res = await db.assignments.getByUser(user.id);
      const list = res?.data || [];
      const a = list.find(x => x.category === dpCategory && (x.channel || 'ALL') === channelKey);
      const trackedWeek = a?.done_week != null ? parseInt(a.done_week) : null;
      const entryWeek = weekForEntry != null ? parseInt(weekForEntry) : null;

      // Xoá 1 báo cáo của tuần cũ đã bị "chốt lại từ 0" ở tuần sau — không trừ nhầm vào số của tuần hiện tại
      if (delta < 0 && trackedWeek != null && entryWeek != null && trackedWeek !== entryWeek) {
        return;
      }

      const baseline = (trackedWeek == null || entryWeek == null || trackedWeek === entryWeek)
        ? (a?.done_locations || 0)
        : 0; // sang tuần mới -> bắt đầu lại từ 0
      const newDone = Math.max(0, baseline + delta);
      await db.assignments.upsert(user.id, dpCategory, {
        locations: a?.locations || 0,
        screens: a?.screens || 0,
        done_locations: newDone,
        done_screens: a?.done_screens || 0,
        week: entryWeek
      }, channelKey);
      const fresh = await db.assignments.getByUser(user.id);
      setAssignments(fresh?.data || []);
    } catch (err) {
      console.error('Không thể đồng bộ tiến độ kênh:', err);
    }
  };

  // Mở báo cáo để điền kết quả thực tế (không tạo báo cáo mới -> tránh nhập 2 lần)
  const handleFillActual = (report) => {
    handleEdit(report);
    setProgressEval('Hoàn thành');
    showMsg(`Đang cập nhật KẾT QUẢ THỰC TẾ cho báo cáo ${formatFullDate(report.date)} — chỉ cần điền phần Tiến độ thực tế rồi Lưu.`, 'success');
  };

  const handleEdit = (report) => {
    setEditingId(report.id);
    setDate(report.date);
    // Nếu là báo cáo DP LCD, điền sẵn số liệu của kênh đó vào lưới nhập nhanh —
    // tách riêng lý do trễ hạn (nếu có) ra khỏi notes để không bị chồng lặp khi nộp lại
    if (dpCategory && report.task_detail === dpCategory && report.channel) {
      const { reasonLate, notes: restNotes } = parseDpNotes(report.notes);
      setDpRows({
        [report.channel]: {
          actualLocations: report.actual_locations ?? '',
          reasonLate
        }
      });
      setNotes(restNotes);
    } else {
      setDpRows({});
      setNotes(report.notes || '');
    }
    if (sysSettings.categories?.includes(report.task_detail)) {
      setTaskDetail(report.task_detail);
      setCustomTaskDetail('');
    } else {
      setTaskDetail('Khác');
      setCustomTaskDetail(report.task_detail);
    }
    setPlanLocations(report.plan_locations ?? '');
    setPlanScreens(report.plan_screens ?? '');
    setPlanDetails(report.plan_details ?? '');
    setActualLocations(report.actual_locations ?? '');
    setActualScreens(report.actual_screens || '');
    setActualDetails(report.actual_details || '');
    setProgressEval(report.progress_eval || 'Hoàn thành');
    setCustomData(report.custom_data || {});
    setHandoverTo(report.handover_to || '');

    // Scroll form into view
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa báo cáo này?')) return;
    try {
      const rep = reports.find(r => r.id === id);
      const { error } = await db.reports.delete(id);
      if (error) throw error;
      // Trừ lại tiến độ kênh nếu xóa báo cáo DP LCD
      if (dpCategory && rep?.task_detail === dpCategory && rep.channel) {
        await adjustDpDone(rep.channel, -(rep.actual_locations || 0), rep.week);
      }
      showMsg('Đã xóa báo cáo thành công!', 'success');
      fetchMyReports();
    } catch (err) {
      showMsg('Không thể xóa báo cáo!', 'danger');
    }
  };

  // Có ô nào trong dòng của 1 kênh được nhập số liệu hay không
  const dpRowHasData = (row) => {
    if (!row) return false;
    return (row.actualLocations !== '' && row.actualLocations != null) || !!row.reasonLate?.trim();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    const finalTaskDetail = taskDetail === 'Khác' ? customTaskDetail : taskDetail;
    if (!finalTaskDetail) {
      showMsg('Vui lòng nhập chi tiết loại công việc!', 'danger');
      setSubmitting(false);
      return;
    }

    const isDp = !!dpCategory && finalTaskDetail === dpCategory;

    // ── Báo cáo DP LCD: nhập nhanh nhiều kênh cùng lúc — mỗi kênh có số liệu sẽ thành 1 báo cáo ──
    if (isDp) {
      const channelsToSubmit = channels.filter(ch => dpRowHasData(dpRows[ch.key]));
      if (channelsToSubmit.length === 0) {
        showMsg('Vui lòng nhập số liệu cho ít nhất 1 kênh hệ thống Golden!', 'danger');
        setSubmitting(false);
        return;
      }

      // Quá hạn (Thứ 4/5/6) mà vẫn chưa nhập đủ vị trí phụ trách thì bắt buộc phải nêu lý do
      if (isPastDpDeadline) {
        const missingReason = channels.find(ch => {
          const a = assignments.find(x => x.category === dpCategory && (x.channel || 'ALL') === ch.key);
          const total = a?.locations || 0;
          if (total <= 0) return false;
          const matchesWeek = a?.done_week != null && parseInt(a.done_week) === parseInt(week);
          const doneSoFar = matchesWeek ? (a?.done_locations || 0) : 0;
          const row = dpRows[ch.key] || {};
          const typed = row.actualLocations !== '' && row.actualLocations != null ? parseInt(row.actualLocations) : 0;
          const projectedRemaining = Math.max(0, total - doneSoFar - typed);
          return projectedRemaining > 0 && !row.reasonLate?.trim();
        });
        if (missingReason) {
          showMsg(`Kênh ${missingReason.title} chưa nhập đủ vị trí và đã quá hạn (${dpEntryWindowRange}) — vui lòng nêu lý do chưa hoàn thành!`, 'danger');
          setSubmitting(false);
          return;
        }
      }

      try {
        const editingReport = editingId ? reports.find(r => r.id === editingId) : null;
        for (const ch of channelsToSubmit) {
          const row = dpRows[ch.key] || {};
          const payload = {
            user_id: user.id,
            week: parseInt(week) || 0,
            date,
            channel: ch.key,
            task_detail: finalTaskDetail,
            // Không cần nhập lại kế hoạch/chi tiết cho DP LCD — số hệ thống phụ trách đã khai sẵn ở tab Golden Asia,
            // và các ô này bị ẩn trên form nên không lấy giá trị còn sót lại từ hạng mục khác
            plan_locations: null,
            plan_screens: null,
            plan_details: null,
            actual_locations: row.actualLocations !== '' && row.actualLocations != null ? Math.max(0, parseInt(row.actualLocations) || 0) : null,
            // DP LCD không theo dõi số màn hình đã lắp — chỉ báo cáo "Lắp đặt" mới cần trường này
            actual_screens: null,
            actual_details: null,
            progress_eval: progressEval,
            // Nếu kênh này quá hạn mà chưa xong, ưu tiên lưu lý do chưa hoàn thành làm ghi chú
            notes: row.reasonLate?.trim()
              ? `${DP_REASON_PREFIX}${row.reasonLate.trim()}${notes ? ' | ' + notes : ''}`
              : notes,
            custom_data: customData,
            handover_to: handoverTo || null
          };

          if (editingReport && editingReport.channel === ch.key) {
            const { error } = await db.reports.update(editingId, payload);
            if (error) throw error;
            const oldActual = editingReport.actual_locations || 0;
            await adjustDpDone(ch.key, (payload.actual_locations || 0) - oldActual, payload.week);
          } else {
            const { error } = await db.reports.create(payload);
            if (error) throw error;
            await adjustDpDone(ch.key, payload.actual_locations || 0, payload.week);
          }
        }
        showMsg(
          channelsToSubmit.length === 1
            ? 'Đã lưu báo cáo DP LCD thành công!'
            : `Đã lưu báo cáo DP LCD cho ${channelsToSubmit.length} kênh!`,
          'success'
        );
        resetForm();
        fetchMyReports();
      } catch (err) {
        console.error(err);
        showMsg('Có lỗi xảy ra khi lưu báo cáo!', 'danger');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ── Hạng mục "Theo kênh" (khác DP LCD, do admin cấu hình): mỗi kênh có số liệu sẽ thành
    // 1 báo cáo riêng — đơn giản hơn DP LCD, không có cửa sổ nhập/lý do trễ hạn/đồng bộ assignments.
    if (isChannelTask) {
      const channelsToSubmit = channels.filter(ch => dpRowHasData(dpRows[ch.key]));
      if (channelsToSubmit.length === 0) {
        showMsg('Vui lòng nhập số liệu cho ít nhất 1 kênh hệ thống Golden!', 'danger');
        setSubmitting(false);
        return;
      }
      try {
        const editingReport = editingId ? reports.find(r => r.id === editingId) : null;
        for (const ch of channelsToSubmit) {
          const row = dpRows[ch.key] || {};
          const payload = {
            user_id: user.id,
            week: parseInt(week) || 0,
            date,
            channel: ch.key,
            task_detail: finalTaskDetail,
            plan_locations: null,
            plan_screens: null,
            plan_details: null,
            actual_locations: row.actualLocations !== '' && row.actualLocations != null ? Math.max(0, parseInt(row.actualLocations) || 0) : null,
            actual_screens: null,
            actual_details: null,
            progress_eval: progressEval,
            notes,
            custom_data: customData,
            handover_to: handoverTo || null
          };
          if (editingReport && editingReport.channel === ch.key) {
            const { error } = await db.reports.update(editingId, payload);
            if (error) throw error;
          } else {
            const { error } = await db.reports.create(payload);
            if (error) throw error;
          }
        }
        showMsg(
          channelsToSubmit.length === 1
            ? 'Đã lưu báo cáo thành công!'
            : `Đã lưu báo cáo cho ${channelsToSubmit.length} kênh!`,
          'success'
        );
        resetForm();
        fetchMyReports();
      } catch (err) {
        console.error(err);
        showMsg('Có lỗi xảy ra khi lưu báo cáo!', 'danger');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Cảnh báo trùng: ngày này đã có 1 báo cáo khác cùng loại công việc rồi (không phải đang sửa lại
    // chính báo cáo đó) — tránh vô tình bấm gửi 2 lần cho cùng 1 ngày + 1 loại việc.
    if (!editingId) {
      const dup = reports.find(r => r.date === date && r.task_detail === finalTaskDetail);
      if (dup) {
        const ok = window.confirm(`Ngày ${formatShortDate(date)} đã có báo cáo "${finalTaskDetail}" rồi. Bạn có chắc muốn tạo thêm 1 báo cáo nữa cho cùng ngày & loại việc này không?`);
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }
    }

    const payload = {
      user_id: user.id,
      week: parseInt(week) || 0,
      date,
      channel: null,
      task_detail: finalTaskDetail,
      plan_locations: planLocations !== '' ? Math.max(0, parseInt(planLocations) || 0) : null,
      plan_screens: planScreens !== '' ? Math.max(0, parseInt(planScreens) || 0) : null,
      plan_details: planDetails,
      actual_locations: actualLocations !== '' ? Math.max(0, parseInt(actualLocations) || 0) : null,
      actual_screens: actualScreens !== '' ? Math.max(0, parseInt(actualScreens) || 0) : null,
      actual_details: actualDetails,
      progress_eval: progressEval,
      notes,
      custom_data: customData,
      handover_to: handoverTo || null
    };

    try {
      if (editingId) {
        const { error } = await db.reports.update(editingId, payload);
        if (error) throw error;
        showMsg('Cập nhật báo cáo thành công!', 'success');
      } else {
        const { error } = await db.reports.create(payload);
        if (error) throw error;
        showMsg('Đã thêm báo cáo thành công!', 'success');
      }
      resetForm();
      fetchMyReports();
    } catch (err) {
      console.error(err);
      showMsg('Có lỗi xảy ra khi lưu báo cáo!', 'danger');
    } finally {
      setSubmitting(false);
    }
  };

  // Stats calculation
  const totalActualScreens = reports.reduce((acc, r) => acc + (r.actual_screens || 0), 0);
  const totalActualLocations = reports.reduce((acc, r) => acc + (r.actual_locations || 0), 0);
  const completedReports = reports.filter(r => r.progress_eval === 'Hoàn thành').length;
  const needsActualCount = reports.filter(needsActual).length;

  // ── Tiến độ DP LCD theo TUẦN đang chọn cho 1 kênh: Kế hoạch (nhập T7/CN) so với ──
  // Thực tế đã cộng dồn (nhập rải rác T3/T4...) — dùng để gợi ý còn bao nhiêu địa điểm cần làm tiếp.
  const getWeekChannelStats = (channelKey) => {
    const wk = parseInt(week) || 0;
    const relevant = reports.filter(r =>
      r.task_detail === dpCategory && r.channel === channelKey && r.week === wk
    );
    const weeklyPlan = relevant.reduce((s, r) => s + (r.plan_locations || 0), 0);
    const weeklyActual = relevant.reduce((s, r) => s + (r.actual_locations || 0), 0);
    return { weeklyPlan, weeklyActual, weeklyRemaining: Math.max(0, weeklyPlan - weeklyActual) };
  };

  // ── Hạng mục "Lũy kế tuần" (VD Tiến độ GP) theo TUẦN đang chọn — đơn giản: chỉ 2 số "Tổng số"
  // và "Đã hoàn thành" (lũy kế), nhân viên tự cập nhật lại "Đã hoàn thành" mỗi ngày cho tới khi
  // bằng Tổng số. Lấy báo cáo GẦN NHẤT (không phải cộng dồn) trong tuần để gợi ý điền sẵn 2 ô
  // này khi mở form ngày mới. Dùng taskDetail trực tiếp — áp dụng cho BẤT KỲ hạng mục nào admin
  // cấu hình kiểu 'weekly_cumulative', không chỉ riêng "Tiến độ GP".
  const latestCumulativeReportThisWeek = reports
    .filter(r => r.task_detail === taskDetail && parseInt(r.week) === parseInt(week) && r.id !== editingId)
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0] || null;

  // Tự điền sẵn "Tổng số" & "Đã hoàn thành" theo báo cáo gần nhất trong tuần khi chuyển sang
  // hạng mục này (chỉ khi tạo báo cáo mới, không đụng vào báo cáo đang sửa dở) — nhân viên chỉ
  // cần sửa lại số "Đã hoàn thành" cho đúng hôm nay, khỏi phải nhớ và gõ lại Tổng số mỗi ngày.
  useEffect(() => {
    if (!isWeeklyCumulativeTask || editingId) return;
    if (latestCumulativeReportThisWeek) {
      setPlanLocations(latestCumulativeReportThisWeek.plan_locations != null ? String(latestCumulativeReportThisWeek.plan_locations) : '');
      setActualLocations(latestCumulativeReportThisWeek.actual_locations != null ? String(latestCumulativeReportThisWeek.actual_locations) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeeklyCumulativeTask, date]);

  // Lọc/Tìm kiếm lịch sử báo cáo — giúp tìm nhanh thay vì cuộn cả bảng dài
  const filteredHistory = reports.filter(r => {
    if (historyFilter === 'needsActual' && !needsActual(r)) return false;
    if (!historySearch.trim()) return true;
    const term = historySearch.trim().toLowerCase();
    return [r.task_detail, r.plan_details, r.actual_details, r.notes]
      .some(v => v && v.toLowerCase().includes(term));
  });

  // Nhóm lịch sử theo TUẦN (giống cách admin xem) — dữ liệu càng nhiều càng khó dò ra 1 báo cáo cụ
  // thể trong 1 bảng phẳng dài dằng dặc, nhóm theo tuần + mới nhất lên đầu giúp tìm/sửa nhanh hơn hẳn.
  const groupedHistory = useMemo(() => {
    const byMonth = {};
    filteredHistory.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const wk = r.week ?? '—';
      
      if (!byMonth[monthKey]) byMonth[monthKey] = {};
      if (!byMonth[monthKey][wk]) byMonth[monthKey][wk] = {};
      
      const dateKey = r.date;
      if (!byMonth[monthKey][wk][dateKey]) byMonth[monthKey][wk][dateKey] = [];
      byMonth[monthKey][wk][dateKey].push(r);
    });

    return Object.entries(byMonth)
      .map(([month, weeksObj]) => {
        const weeks = Object.entries(weeksObj)
          .map(([week, datesObj]) => {
            const dates = Object.entries(datesObj)
              .map(([date, rows]) => ({
                date,
                rows: rows.sort((a, b) => {
                  if (b.created_at && a.created_at) {
                    return new Date(b.created_at) - new Date(a.created_at);
                  }
                  return (b.id || '').localeCompare(a.id || '');
                })
              }))
              .sort((a, b) => new Date(b.date) - new Date(a.date));
            
            const totalInWeek = dates.reduce((acc, d) => acc + d.rows.length, 0);

            return {
              week,
              dates,
              totalInWeek
            };
          })
          .sort((a, b) => (parseInt(b.week) || 0) - (parseInt(a.week) || 0));

        const totalInMonth = weeks.reduce((acc, w) => acc + w.totalInWeek, 0);

        return {
          month,
          weeks,
          totalInMonth
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month)); // Sort months descending
  }, [filteredHistory]);

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>
      
      {/* Overview Cards */}
      <div className="stats-row" style={{ marginTop: '2rem' }}>
        <div className="card-glass stat-card">
          <div className="stat-icon">
            <Monitor size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Tổng màn hình hoàn thành</span>
            <span className="stat-value">{totalActualScreens}</span>
          </div>
        </div>
        <div className="card-glass stat-card">
          <div className="stat-icon" style={{ color: 'var(--success)', background: 'var(--success-bg)' }}>
            <MapPin size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Tổng địa điểm hoàn thành</span>
            <span className="stat-value">{totalActualLocations}</span>
          </div>
        </div>
        <div className="card-glass stat-card">
          <div className="stat-icon" style={{ color: 'var(--warning)', background: 'var(--warning-bg)' }}>
            <CheckCircle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Báo cáo hoàn tất (Tuần này)</span>
            <span className="stat-value">{completedReports}/{reports.length}</span>
          </div>
        </div>
      </div>

      {message.text && (
        <div style={{
          background: message.type === 'success' ? 'var(--success-bg)' : 'var(--danger-bg)',
          color: message.type === 'success' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${message.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
          padding: '0.875rem 1.25rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.5rem',
          fontSize: '0.9rem'
        }}>
          {message.text}
        </div>
      )}

      {/* Main Grid: Form Left, List Right */}
      <div className="employee-grid">
        
        {/* Form Column */}
        <div className="card-glass">
          <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>
              {editingId ? 'Cập nhật báo cáo' : 'Tạo báo cáo ngày mới'}
            </h3>
            {!editingId && reports.length > 0 && (
              <button type="button" className="btn btn-secondary" onClick={handleCopyLast}
                title="Chép kế hoạch từ ngày liền trước (không có thì lấy báo cáo gần nhất)"
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <Copy size={14} /> Chép kế hoạch cũ
              </button>
            )}
          </div>
          
          <form onSubmit={handleSubmit}>
            {/* ── Chọn ngày theo tuần + nhập Kế hoạch dự kiến ngay tại đây — gộp thành 1 bước duy nhất, ── */}
            {/* không tách ra 1 phần riêng nữa: bấm vào 1 thứ là thấy luôn kế hoạch của ngày đó để nhập trước. */}
            <div className="form-group" style={{
              background: 'var(--surface-inset)', border: '1px solid var(--border-glass)',
              borderRadius: 'var(--radius-md)', padding: '1rem'
            }}>
              <label className="form-label" style={{ display: 'block', marginBottom: '0.6rem' }}>
                📅 Chọn ngày & nhập kế hoạch dự kiến
              </label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {weekStripDows.map((dow) => {
                  const iso = weekStripDates[dow];
                  const isSelected = date === iso;
                  const isToday = iso === todayIso;
                  const count = reportCountByDate[iso] || 0;
                  const status = getDayStatus(iso);
                  const statusColor = DAY_STATUS_COLOR[status];
                  return (
                    <button
                      type="button"
                      key={dow}
                      onClick={() => setDate(iso)}
                      title={`${formatFullDate(iso)}${status === 'done' ? ' — Đã xong' : status === 'issue' ? ' — Cần hỗ trợ/Trễ hạn' : status === 'inprogress' ? ' — Đang thực hiện/chờ Thực tế' : ' — Chưa có báo cáo'}`}
                      style={{
                        position: 'relative',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem',
                        padding: '0.5rem 0.35rem', minWidth: '62px', flex: '1 1 62px',
                        borderRadius: 'var(--radius-md)', cursor: 'pointer',
                        border: isSelected ? '1.5px solid var(--accent-color)' : '1px solid var(--border-glass)',
                        background: isSelected ? 'var(--accent-glow)' : (isToday ? 'var(--surface-hover, rgba(255,255,255,0.04))' : 'transparent'),
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', fontWeight: isSelected ? 700 : 500, color: isSelected ? 'var(--accent-color)' : 'var(--text-primary)' }}>
                        {dayLabel(dow).replace('Thứ ', 'T')}
                      </span>
                      <span style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                        {formatShortDate(iso).slice(0, 5)}
                      </span>
                      {isToday && (
                        <span style={{ fontSize: '0.58rem', color: 'var(--accent-color)', fontWeight: 600 }}>Hôm nay</span>
                      )}
                      {count > 0 && (
                        <span style={{
                          position: 'absolute', top: '-5px', right: '-5px', minWidth: '15px', height: '15px', padding: '0 3px',
                          borderRadius: '999px', background: statusColor || 'var(--success)', color: '#fff',
                          fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 0 0 2px var(--surface-inset)'
                        }}>
                          {status === 'done' ? '✓' : status === 'issue' ? '⚠' : count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Thanh tiến độ tổng của tuần đang chọn — Thực tế / Kế hoạch (Đ.điểm + Màn hình) */}
              <div style={{ marginTop: '0.6rem' }}>
                <div className="flex-between" style={{ marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Tiến độ Tuần {week}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {weekActualTotal}/{weekPlanTotal || 0} ({weekProgressPct}%)
                  </span>
                </div>
                <div style={{ height: '6px', borderRadius: '999px', background: 'var(--surface-inset)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${weekProgressPct}%`, borderRadius: '999px',
                    background: weekProgressPct >= 100 ? 'var(--success)' : weekProgressPct >= 50 ? 'var(--accent-color)' : 'var(--warning)',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* Nhắc các ngày trong tuần (tính đến hôm nay) vẫn chưa có báo cáo nào — bấm để nhảy tới */}
              {missingDaysThisWeek.length > 0 && (
                <div style={{
                  marginTop: '0.6rem', padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)',
                  background: 'var(--warning-bg)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem'
                }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--warning)', fontWeight: 600 }}>
                    ⏰ Còn {missingDaysThisWeek.length} ngày chưa gửi báo cáo:
                  </span>
                  {missingDaysThisWeek.map(iso => (
                    <button key={iso} type="button" onClick={() => setDate(iso)}
                      style={{
                        fontSize: '0.7rem', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--warning)', background: 'transparent', color: 'var(--warning)', cursor: 'pointer'
                      }}>
                      {dayLabel(new Date(iso + 'T00:00:00').getDay()).replace('Thứ ', 'T')} {formatShortDate(iso).slice(0, 5)}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-between" style={{ marginTop: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.82rem', color: 'var(--accent-color)', fontWeight: 600 }}>
                  📅 Đang lập kế hoạch cho: {formatFullDate(date)} — Tuần {week}
                </span>
                <input
                  type="date"
                  className="input-field"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  title="Chọn ngày khác (tuần trước/sau) — chọn ngày tương lai nếu lập kế hoạch trước"
                  style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem', width: 'auto' }}
                />
              </div>

              {/* Báo cáo đã gửi sẵn cho đúng ngày đang chọn — bấm vào 1 thứ ở trên là thấy ngay */}
              {/* các báo cáo cũ của ngày đó để sửa nhanh, khỏi phải dò trong bảng lịch sử dài bên dưới */}
              {(() => {
                const dayReports = reports.filter(r => r.date === date);
                if (dayReports.length === 0) return null;
                return (
                  <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      📋 Đã có {dayReports.length} báo cáo cho ngày này — bấm để sửa nhanh:
                    </span>
                    {dayReports.map(r => (
                      <div key={r.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 0.65rem', borderRadius: 'var(--radius-sm)',
                        background: r.id === editingId ? 'var(--accent-glow)' : 'var(--surface-inset)',
                        border: r.id === editingId ? '1px solid var(--accent-color)' : '1px solid var(--border-glass)'
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <span className="badge badge-info" style={{ fontSize: '0.63rem' }}>{r.task_detail}</span>
                          {r.channel && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>
                              {channelLabels[r.channel] || r.channel}
                            </span>
                          )}
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                            KH {r.plan_locations ?? '-'}/{r.plan_screens ?? '-'} • TT {r.actual_locations ?? '-'}/{r.actual_screens ?? '-'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                          {needsActual(r) && (
                            <button type="button" className="btn btn-success" onClick={() => handleFillActual(r)}
                              title="Điền Tiến độ thực tế" style={{ padding: '0.3rem 0.45rem', fontSize: '0.65rem' }}>
                              <ClipboardCheck size={12} />
                            </button>
                          )}
                          <button type="button" className="btn btn-secondary" onClick={() => handleEdit(r)}
                            title="Sửa báo cáo" style={{ padding: '0.3rem 0.45rem', fontSize: '0.65rem' }}>
                            <Edit size={12} />
                          </button>
                          <button type="button" className="btn btn-danger" onClick={() => handleDelete(r.id)}
                            title="Xóa báo cáo" style={{ padding: '0.3rem 0.45rem', fontSize: '0.65rem' }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {isFutureDate && (
                <div style={{
                  marginTop: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                  background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '0.78rem'
                }}>
                  🔮 Đây là ngày trong tương lai — chỉ nên dùng để <strong>lập Kế hoạch dự kiến trước</strong>. Đợi đến đúng ngày {formatFullDate(date)} (hoặc sau đó) rồi hãy quay lại nhập <strong>Tiến độ thực tế</strong>.
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '0.9rem 0' }} />

              <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                <label className="form-label">Loại công việc (Chi tiết công việc)</label>
                <select
                  className="input-field"
                  value={taskDetail}
                  onChange={(e) => setTaskDetail(e.target.value)}
                >
                  {sysSettings.categories?.map(cat => (
                    <option key={cat} value={cat} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                      {cat}
                    </option>
                  ))}
                  <option value="Khác" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                    Khác... (tự nhập)
                  </option>
                </select>
              </div>

              {taskDetail === 'Khác' && (
                <div className="form-group">
                  <label className="form-label">Nhập loại công việc khác</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ví dụ: Họp kỹ thuật, Nghiên cứu..."
                    value={customTaskDetail}
                    onChange={(e) => setCustomTaskDetail(e.target.value)}
                    required
                  />
                </div>
              )}

              {/* Kế hoạch dự kiến — không còn là 1 khối riêng ở xa nữa, nhập ngay tại đây cho ngày đã chọn ở trên */}
              {!isDpTask && !isWeeklyCumulativeTask && !isChannelTask && (
                <div style={{ marginTop: '0.75rem' }}>
                  <div className="flex-between" style={{ marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {templateAppliedToday
                        ? `✓ Đã tự điền theo lịch mẫu admin đặt cho ${dayLabel(reportDow)}.`
                        : (defaults.default_locations != null || defaults.default_screens != null) && !editingId
                          ? '📌 Đã tự điền sẵn theo thiết lập mặc định — chỉnh lại nếu hôm nay khác.'
                          : 'Nhập số liệu dự kiến cho ngày này.'}
                    </span>
                    <button type="button" className="btn btn-secondary" onClick={handleSaveDefaults}
                      title="Lưu số địa điểm / màn hình / loại công việc hiện tại làm mặc định — lần sau form tự điền sẵn"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: 'var(--radius-sm)', whiteSpace: 'nowrap' }}>
                      <Pin size={12} /> Lưu làm mặc định
                    </button>
                  </div>
                  <div className="form-grid">
                    {sysSettings.fields?.find(f => f.id === 'plan_locations')?.enabled && (
                      <div className="form-group">
                        <label className="form-label">{sysSettings.fields.find(f => f.id === 'plan_locations').label}</label>
                        <input
                          type="number"
                          className="input-field"
                          min="0"
                          placeholder="0"
                          value={planLocations}
                          onChange={(e) => setPlanLocations(e.target.value)}
                        />
                      </div>
                    )}
                    {sysSettings.fields?.find(f => f.id === 'plan_screens')?.enabled && (
                      <div className="form-group">
                        <label className="form-label">{sysSettings.fields.find(f => f.id === 'plan_screens').label}</label>
                        <input
                          type="number"
                          className="input-field"
                          min="0"
                          placeholder="0"
                          value={planScreens}
                          onChange={(e) => setPlanScreens(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                  {sysSettings.fields?.find(f => f.id === 'plan_details')?.enabled && (
                    <div className="form-group">
                      <label className="form-label">{sysSettings.fields.find(f => f.id === 'plan_details').label}</label>
                      <textarea
                        className="input-field"
                        placeholder="Ví dụ: Thay chương trình tại cơ sở A..."
                        value={planDetails}
                        onChange={(e) => setPlanDetails(e.target.value)}
                        rows="3"
                        style={{ resize: 'vertical' }}
                      ></textarea>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Báo cáo DP LCD: nhập nhanh số liệu cho tất cả các kênh hệ thống Golden ── */}
            {isDpTask && (
              <div className="form-group" style={{
                background: 'var(--accent-glow)', padding: '0.9rem',
                borderRadius: 'var(--radius-sm)', border: '1px solid rgba(217, 119, 87, 0.25)'
              }}>
                <label className="form-label" style={{ color: 'var(--accent-color)', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  <Tv size={14} style={{ verticalAlign: '-2px', marginRight: '0.3rem' }} />
                  Nhập nhanh theo từng kênh hệ thống Golden — bỏ trống kênh nào chưa có số liệu
                </label>
                {isFutureDate && (
                  <div style={{
                    marginBottom: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                    background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '0.78rem'
                  }}>
                    ⚠ Ngày {formatFullDate(date)} chưa tới — số "Đã hoàn thành" bên dưới là số liệu thực tế, chưa nên nhập cho ngày trong tương lai. Hãy đợi đến đúng ngày đó rồi quay lại nhập nhé.
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
                  📅 Tiến độ DP LCD thường được nhập vào {dpEntryWindowText} hàng tuần. Số địa điểm phụ trách (hệ thống) đã khai 1 lần ở tab "Kênh dịch vụ Golden Asia" — ở đây bạn <strong>chỉ cần nhập số địa điểm đã hoàn thành thực tế</strong>,
                  tiến độ sẽ tự tính dựa trên số hệ thống đã khai đó. Kênh nào đã nhập đủ tiến độ cho tuần này rồi thì không cần nhập thêm nữa.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {channels.map(ch => {
                    const a = assignments.find(x => x.category === dpCategory && (x.channel || 'ALL') === ch.key);
                    const row = dpRows[ch.key] || {};
                    const { weeklyActual } = getWeekChannelStats(ch.key);
                    const total = a?.locations || 0;
                    // "Đã hoàn thành" chỉ tính nếu đúng tuần đang báo cáo — sang tuần mới sẽ tự về 0 (xem tính năng reset theo tuần)
                    const matchesWeek = a?.done_week != null && parseInt(a.done_week) === parseInt(week);
                    const doneSoFar = matchesWeek ? (a?.done_locations || 0) : 0;
                    const remaining = Math.max(0, total - doneSoFar);
                    // Kênh chưa được khai số địa điểm phụ trách (total=0) ⇒ mặc định hiểu là
                    // nhân viên này KHÔNG phụ trách kênh đó, nên không cần hiện ô nhập nữa.
                    if (!a || total <= 0) {
                      return (
                        <div key={ch.key} className="dp-channel-row" style={{ opacity: 0.55 }}>
                          <div className="dp-channel-row-head">
                            <strong>{ch.title}</strong>
                            <span className="dp-channel-info">Không phụ trách kênh này</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={ch.key} className="dp-channel-row">
                        <div className="dp-channel-row-head">
                          <strong>{ch.title}</strong>
                          <span className={remaining > 0 ? 'dp-channel-info warn' : 'dp-channel-info ok'}>
                            Tổng {total}/{doneSoFar} đ.điểm đã HT
                            {remaining > 0 ? ` — còn ${remaining} cần làm` : ' — đã xong ✓'}
                          </span>
                        </div>
                        {weeklyActual > 0 && (
                          <div className="dp-channel-week-hint">
                            <span className="dp-channel-info">
                              Tuần {week}: đã báo cáo {weeklyActual} đ.điểm thực tế
                            </span>
                          </div>
                        )}
                        {total > 0 && remaining <= 0 ? (
                          <div className="dp-channel-info ok" style={{ display: 'inline-block' }}>
                            ✓ Đã nhập đủ tiến độ tuần này ({total}/{doneSoFar}) — không cần nhập thêm
                          </div>
                        ) : (
                          <>
                            <div className="dp-channel-inputs">
                              <div className="dp-input-group">
                                <label>Đã hoàn thành (Đ.điểm)</label>
                                <input type="number" className="input-field" min="0" step="1"
                                  placeholder={total > 0 ? `Gợi ý: ${remaining}` : '0'}
                                  value={row.actualLocations ?? ''}
                                  onChange={(e) => updateDpRow(ch.key, 'actualLocations', e.target.value)} />
                              </div>
                            </div>
                            {(() => {
                              // Gợi ý sống theo số đang gõ: nếu nhập chưa đủ, nhắc còn thiếu bao nhiêu để đủ tuần này
                              if (total <= 0) return null;
                              const typed = row.actualLocations !== '' && row.actualLocations != null ? parseInt(row.actualLocations) : null;
                              if (typed == null || isNaN(typed)) return null;
                              const stillMissing = Math.max(0, remaining - typed);
                              if (stillMissing <= 0) return null;
                              return (
                                <div className="dp-channel-info warn" style={{ marginTop: '0.3rem', display: 'inline-block' }}>
                                  Nhập {typed} thì vẫn còn thiếu {stillMissing} vị trí — nhập đủ <strong>{remaining}</strong> để hoàn thành tiến độ tuần này
                                </div>
                              );
                            })()}
                            {isPastDpDeadline && total > 0 && remaining > 0 && (
                              <div className="dp-input-group" style={{ marginTop: '0.4rem' }}>
                                <label style={{ color: 'var(--danger)' }}>
                                  ⚠ Đã quá hạn ({dpEntryWindowRange}) mà chưa nhập đủ vị trí — bắt buộc nêu lý do
                                </label>
                                <input type="text" className="input-field"
                                  placeholder="VD: địa điểm đóng cửa, thiếu thiết bị, chờ duyệt mặt bằng..."
                                  value={row.reasonLate ?? ''}
                                  onChange={(e) => updateDpRow(ch.key, 'reasonLate', e.target.value)} />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.6rem', display: 'block' }}>
                  Số địa điểm thực tế của mỗi kênh sẽ <strong>tự cộng vào tiến độ</strong> — không cần cập nhật lại ở tab Kênh dịch vụ.
                </span>
              </div>
            )}

            {/* ── Hạng mục "Lũy kế tuần" (VD Tiến độ GP): nhập Tổng số + Đã hoàn thành (lũy kế),
                 đơn giản, luôn 2 ô. Áp dụng cho BẤT KỲ hạng mục nào admin cấu hình kiểu này. ── */}
            {isWeeklyCumulativeTask && (
              <div className="form-group" style={{
                background: 'var(--accent-glow)', padding: '0.9rem',
                borderRadius: 'var(--radius-sm)', border: '1px solid rgba(217, 119, 87, 0.25)'
              }}>
                <label className="form-label" style={{ color: 'var(--accent-color)', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  📌 {taskDetail} — Tuần {week}
                </label>
                {isFutureDate && (
                  <div style={{
                    marginBottom: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                    background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '0.78rem'
                  }}>
                    ⚠ Ngày {formatFullDate(date)} chưa tới — "Đã hoàn thành" là số liệu thực tế, chưa nên nhập cho ngày trong tương lai.
                  </div>
                )}
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.7rem' }}>
                  Nhập <strong>Tổng số</strong> cần làm tuần này (giữ nguyên cho các ngày sau), và cập nhật lại <strong>Đã hoàn thành</strong> (lũy kế) mỗi ngày cho tới khi đủ số lượng.
                </p>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">Tổng số cần làm</label>
                    <input type="number" className="input-field" min="0" step="1" placeholder="VD: 50"
                      value={planLocations} onChange={(e) => setPlanLocations(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Đã hoàn thành (lũy kế)</label>
                    <input type="number" className="input-field" min="0" step="1" placeholder="0"
                      value={actualLocations} onChange={(e) => setActualLocations(e.target.value)} />
                  </div>
                </div>
                {planLocations !== '' && (() => {
                  const total = parseInt(planLocations) || 0;
                  const done = actualLocations !== '' ? (parseInt(actualLocations) || 0) : 0;
                  const remaining = Math.max(0, total - done);
                  const isDone = total > 0 && done >= total;
                  return (
                    <span className={isDone ? 'dp-channel-info ok' : 'dp-channel-info warn'}>
                      {total}/{done} địa điểm {isDone ? '— đã xong ✓' : `— còn ${remaining} cần làm`}
                    </span>
                  );
                })()}
              </div>
            )}

            {/* ── Hạng mục "Theo kênh" (khác DP LCD): nhập số đã làm riêng cho từng kênh hệ thống
                 Golden, đơn giản — không có cửa sổ nhập/lý do trễ hạn riêng như DP LCD. ── */}
            {isChannelTask && (
              <div className="form-group" style={{
                background: 'var(--accent-glow)', padding: '0.9rem',
                borderRadius: 'var(--radius-sm)', border: '1px solid rgba(217, 119, 87, 0.25)'
              }}>
                <label className="form-label" style={{ color: 'var(--accent-color)', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  📌 {taskDetail} — theo từng kênh
                </label>
                {isFutureDate && (
                  <div style={{
                    marginBottom: '0.6rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                    background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '0.78rem'
                  }}>
                    ⚠ Ngày {formatFullDate(date)} chưa tới — số liệu thực tế chưa nên nhập cho ngày trong tương lai.
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {channels.map(ch => {
                    const row = dpRows[ch.key] || {};
                    return (
                      <div key={ch.key} className="dp-channel-row">
                        <div className="dp-channel-row-head">
                          <strong>{ch.title}</strong>
                        </div>
                        <div className="dp-channel-inputs">
                          <div className="dp-input-group">
                            <label>Đã làm (Đ.điểm)</label>
                            <input type="number" className="input-field" min="0" step="1" placeholder="0"
                              value={row.actualLocations ?? ''}
                              onChange={(e) => updateDpRow(ch.key, 'actualLocations', e.target.value)} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.6rem', display: 'block' }}>
                  Chỉ kênh nào có nhập số mới được lưu thành báo cáo — để trống các kênh không phụ trách hôm nay.
                </span>
              </div>
            )}

            {/* Tiến độ thực tế */}
            <FormSection
              title="Tiến độ thực tế"
              icon={ClipboardCheck}
              open={openSections.actual}
              onToggle={() => toggleSection('actual')}
              accent="var(--success)"
            >
              {isFutureDate && (
                <div style={{
                  marginBottom: '0.75rem', padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                  background: 'var(--warning-bg)', color: 'var(--warning)', fontSize: '0.78rem'
                }}>
                  ⚠ Ngày {formatFullDate(date)} chưa tới — chưa nên nhập Tiến độ thực tế cho ngày này. Hãy đợi đến đúng ngày đó rồi quay lại điền nhé.
                </div>
              )}
              {isDpTask && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Số liệu theo từng kênh đã nhập ở mục DP LCD phía trên.
                </p>
              )}
              {isWeeklyCumulativeTask && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Số liệu đã nhập ở mục "{taskDetail}" phía trên.
                </p>
              )}
              {isChannelTask && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Số liệu theo từng kênh đã nhập ở mục "{taskDetail}" phía trên.
                </p>
              )}
              {!isDpTask && !isWeeklyCumulativeTask && !isChannelTask && (
              <div className="form-grid">
                {sysSettings.fields?.find(f => f.id === 'actual_locations')?.enabled && (
                  <div className="form-group">
                    <label className="form-label">{sysSettings.fields.find(f => f.id === 'actual_locations').label}</label>
                    <input
                      type="number"
                      className="input-field"
                      min="0"
                      placeholder="0"
                      value={actualLocations}
                      onChange={(e) => setActualLocations(e.target.value)}
                    />
                  </div>
                )}
                {sysSettings.fields?.find(f => f.id === 'actual_screens')?.enabled && (
                  <div className="form-group">
                    <label className="form-label">{sysSettings.fields.find(f => f.id === 'actual_screens').label}</label>
                    <input
                      type="number"
                      className="input-field"
                      min="0"
                      placeholder="0"
                      value={actualScreens}
                      onChange={(e) => setActualScreens(e.target.value)}
                    />
                  </div>
                )}
              </div>
              )}
              {!isDpTask && !isWeeklyCumulativeTask && !isChannelTask && sysSettings.fields?.find(f => f.id === 'actual_details')?.enabled && (
                <div className="form-group">
                  <label className="form-label">{sysSettings.fields.find(f => f.id === 'actual_details').label}</label>
                  <textarea
                    className="input-field"
                    placeholder="Ví dụ: Đã hoàn thành lắp đặt tại cơ sở A..."
                    value={actualDetails}
                    onChange={(e) => setActualDetails(e.target.value)}
                    rows="3"
                    style={{ resize: 'vertical' }}
                  ></textarea>
                </div>
              )}
            </FormSection>

            {/* Đánh giá & Ghi chú */}
            <FormSection
              title="Đánh giá & Ghi chú"
              icon={ListChecks}
              open={openSections.eval}
              onToggle={() => toggleSection('eval')}
              accent="var(--info)"
            >
              <div className="form-group">
                <label className="form-label">Đánh giá tiến độ</label>
                <div className="chip-group">
                  {PROGRESS_OPTIONS.map(opt => (
                    <button
                      type="button"
                      key={opt.value}
                      className={`badge ${opt.badge} chip-option ${progressEval === opt.value ? 'active' : ''}`}
                      onClick={() => setProgressEval(opt.value)}
                    >
                      {progressEval === opt.value && <CheckCircle size={12} style={{ marginRight: '0.3rem' }} />}
                      {opt.value}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Fields */}
              {sysSettings.fields?.filter(f => f.isCustom && f.enabled).map(field => (
                <div className="form-group" key={field.id} style={{ marginTop: '1rem' }}>
                  <label className="form-label">{field.label}</label>
                  {field.type === 'textarea' ? (
                    <textarea
                      className="input-field"
                      value={customData[field.id] || ''}
                      onChange={(e) => setCustomData({ ...customData, [field.id]: e.target.value })}
                      rows="3"
                      style={{ resize: 'vertical' }}
                    ></textarea>
                  ) : (
                    <input
                      type="text"
                      className="input-field"
                      value={customData[field.id] || ''}
                      onChange={(e) => setCustomData({ ...customData, [field.id]: e.target.value })}
                    />
                  )}
                </div>
              ))}

              {sysSettings.fields?.find(f => f.id === 'notes')?.enabled && (
                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">{sysSettings.fields.find(f => f.id === 'notes').label}</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Ghi chú thêm (nếu có)..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              )}

              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label className="form-label">Bàn giao cho (tuỳ chọn)</label>
                <select
                  className="input-field"
                  value={handoverTo}
                  onChange={(e) => setHandoverTo(e.target.value)}
                >
                  <option value="">— Không bàn giao —</option>
                  {colleagues.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}{p.position ? ` (${p.position})` : ''}</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', display: 'block' }}>
                  Chọn đồng nghiệp tiếp nhận/xử lý tiếp công việc này (nếu có bàn giao).
                </span>
              </div>
            </FormSection>

            {/* Thông báo lỗi hiện NGAY TRÊN nút Gửi — người dùng đứng cuối form luôn nhìn thấy,
                không còn cảnh lỗi chỉ hiện ở đầu trang rồi tự biến mất khiến tưởng app không lưu */}
            {message.text && message.type !== 'success' && (
              <div style={{
                background: 'var(--danger-bg)', color: 'var(--danger)',
                border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 'var(--radius-md)',
                padding: '0.7rem 1rem', marginBottom: '0.75rem', fontSize: '0.85rem',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem'
              }}>
                <span>⚠ {message.text}</span>
                <button type="button" onClick={() => setMessage({ text: '', type: '' })}
                  style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                  title="Đóng">✕</button>
              </div>
            )}

            <div className="form-sticky-actions flex-between">
              {editingId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetForm}
                >
                  Hủy sửa
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary w-full" 
                disabled={submitting}
                style={{ marginLeft: editingId ? '1rem' : 0 }}
              >
                {submitting ? (
                  <div className="spinner"></div>
                ) : editingId ? (
                  'Lưu cập nhật'
                ) : (
                  <>
                    <PlusCircle size={18} /> Gửi báo cáo
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* List Column */}
        <div className="card-glass">
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Lịch sử báo cáo đã gửi</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {filteredHistory.length}/{reports.length} báo cáo
            </span>
          </div>

          {reports.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.25rem' }}>
              <div style={{ position: 'relative', flex: '1 1 200px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  className="input-field w-full"
                  placeholder="Tìm theo loại việc, ghi chú..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  style={{ paddingLeft: '2rem' }}
                />
                {historySearch && (
                  <button type="button" onClick={() => setHistorySearch('')}
                    style={{ position: 'absolute', right: '8px', top: '9px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <button type="button" className={`time-range-btn ${historyFilter === 'all' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('all')}>
                Tất cả
              </button>
              <button type="button" className={`time-range-btn ${historyFilter === 'needsActual' ? 'active' : ''}`}
                onClick={() => setHistoryFilter('needsActual')}>
                Cần nhập thực tế{needsActualCount > 0 ? ` (${needsActualCount})` : ''}
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
              <div className="spinner" style={{ width: '2.5rem', height: '2.5rem', color: 'var(--accent-color)' }}></div>
            </div>
          ) : reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Chưa có báo cáo nào được gửi. Vui lòng điền thông tin bên trái để gửi báo cáo!
            </div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Không tìm thấy báo cáo nào khớp bộ lọc.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {groupedHistory.map((monthGroup, monthIdx) => {
                const isMonthOpen = expandedMonths[monthGroup.month] !== undefined 
                  ? expandedMonths[monthGroup.month] 
                  : monthIdx === 0;
                
                return (
                  <div key={monthGroup.month} style={{
                    border: '1px solid var(--border-glass)',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    background: 'var(--bg-glass)',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {/* Month Header */}
                    <button
                      type="button"
                      onClick={() => toggleMonth(monthGroup.month)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.85rem 1.1rem',
                        background: 'var(--surface-inset)',
                        border: 'none',
                        borderBottom: isMonthOpen ? '1px solid var(--border-glass)' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background var(--transition-fast)'
                      }}
                      className="form-section-header"
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.92rem', fontFamily: 'var(--font-heading)' }}>
                        📅 {formatMonthTitle(monthGroup.month)}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span className="badge badge-info" style={{ fontSize: '0.7rem', padding: '0.15rem 0.45rem', opacity: 0.85 }}>
                          {monthGroup.totalInMonth} báo cáo
                        </span>
                        {isMonthOpen ? <ChevronUp size={16} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)' }} />}
                      </div>
                    </button>

                    {/* Weeks list inside Month */}
                    {isMonthOpen && (
                      <div style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', background: 'rgba(255,255,255,0.01)' }}>
                        {monthGroup.weeks.map((weekGroup, weekIdx) => {
                          const weekKey = `${monthGroup.month}-W${weekGroup.week}`;
                          const isWeekOpen = expandedWeeks[weekKey] !== undefined
                            ? expandedWeeks[weekKey]
                            : (monthIdx === 0 && weekIdx === 0);

                          return (
                            <div key={weekKey} style={{
                              border: '1px solid rgba(217, 119, 87, 0.15)',
                              borderRadius: 'var(--radius-sm)',
                              overflow: 'hidden',
                              background: 'rgba(20, 20, 19, 0.01)'
                            }}>
                              {/* Week Header */}
                              <button
                                type="button"
                                onClick={() => toggleWeek(weekKey)}
                                style={{
                                  width: '100%',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '0.55rem 0.85rem',
                                  background: 'var(--surface-inset-strong)',
                                  border: 'none',
                                  borderBottom: isWeekOpen ? '1px solid rgba(217, 119, 87, 0.15)' : 'none',
                                  cursor: 'pointer',
                                  textAlign: 'left'
                                }}
                                className="form-section-header"
                              >
                                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent-color)', fontWeight: 600, fontSize: '0.82rem' }}>
                                  {isWeekOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  Tuần {weekGroup.week}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  ({weekGroup.totalInWeek} báo cáo)
                                </span>
                              </button>

                              {/* Days list inside Week */}
                              {isWeekOpen && (
                                <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                  {weekGroup.dates.map(dayGroup => {
                                    const dayOfWeek = new Date(dayGroup.date + 'T00:00:00').getDay();
                                    const dayName = dayLabel(dayOfWeek);
                                    const isSelectedDate = date === dayGroup.date;

                                    return (
                                      <div key={dayGroup.date} className="card-glass" style={{
                                        padding: '0.85rem',
                                        borderRadius: 'var(--radius-md)',
                                        border: isSelectedDate ? '1.5px solid var(--accent-color)' : '1px solid var(--border-glass)',
                                        background: isSelectedDate ? 'var(--accent-glow)' : 'var(--bg-glass)',
                                        boxShadow: 'var(--shadow-sm)'
                                      }}>
                                        {/* Day Header */}
                                        <div style={{
                                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                          borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.4rem', marginBottom: '0.6rem'
                                        }}>
                                          <div onClick={() => setDate(dayGroup.date)} style={{ cursor: 'pointer' }}>
                                            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{dayName}</strong>
                                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                                              {formatShortDate(dayGroup.date)}
                                            </span>
                                          </div>
                                          <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                                            {dayGroup.rows.length} báo cáo
                                          </span>
                                        </div>

                                        {/* Reports list */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                          {dayGroup.rows.map((report, idx) => {
                                            const isEditingThis = report.id === editingId;
                                            return (
                                              <div key={report.id} style={{
                                                paddingTop: idx > 0 ? '0.65rem' : '0',
                                                borderTop: idx > 0 ? '1px dashed var(--border-glass)' : 'none',
                                                display: 'flex', flexDirection: 'column', gap: '0.4rem',
                                                background: isEditingThis ? 'var(--accent-glow)' : undefined,
                                                borderRadius: isEditingThis ? 'var(--radius-sm)' : undefined,
                                                padding: isEditingThis ? '0.4rem' : undefined
                                              }}>
                                                
                                                {/* Header info */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.4rem' }}>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                                      {report.task_detail}
                                                    </span>
                                                    {report.channel && (
                                                      <span className="badge badge-info" style={{ fontSize: '0.6rem', padding: '0.05rem 0.25rem' }}>
                                                        {channelLabels[report.channel] || report.channel}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <span className={`badge ${
                                                    report.progress_eval === 'Hoàn thành' ? 'badge-success' :
                                                    report.progress_eval === 'Cần hỗ trợ' ? 'badge-danger' :
                                                    report.progress_eval === 'Đang thực hiện' ? 'badge-info' : 'badge-warning'
                                                  }`} style={{ fontSize: '0.65rem' }}>
                                                    {report.progress_eval || 'Hoàn thành'}
                                                  </span>
                                                </div>

                                                {/* Plan/Actual content */}
                                                <div style={{
                                                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem',
                                                  background: 'var(--surface-inset)', padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-sm)',
                                                  fontSize: '0.75rem'
                                                }}>
                                                  <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.1rem', fontSize: '0.6rem', textTransform: 'uppercase' }}>
                                                      🎯 Kế hoạch
                                                    </div>
                                                    <div>
                                                      📍 {report.plan_locations ?? 0} đ.điểm / 📺 {report.plan_screens ?? 0} MH
                                                    </div>
                                                    {report.plan_details && (
                                                      <div className="detail-clamp-text" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }} title={report.plan_details}>
                                                        {report.plan_details}
                                                      </div>
                                                    )}
                                                  </div>
                                                  <div>
                                                    <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem', fontSize: '0.65rem', textTransform: 'uppercase' }}>
                                                      🚀 Thực tế
                                                    </div>
                                                    <div>
                                                      📍 {report.actual_locations ?? 0} đ.điểm / 📺 {report.actual_screens ?? 0} MH
                                                    </div>
                                                    {report.actual_details && (
                                                      <div className="detail-clamp-text" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }} title={report.actual_details}>
                                                        {report.actual_details}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>

                                                {/* Notes */}
                                                {report.notes && (
                                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--surface-inset)', padding: '0.3rem 0.45rem', borderRadius: 'var(--radius-sm)' }}>
                                                    📝 {report.notes}
                                                  </div>
                                                )}

                                                {/* Handover */}
                                                {report.handover_to && (
                                                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                                    🤝 Bàn giao: <span style={{ fontWeight: 500 }}>{colleagues.find(c => c.id === report.handover_to)?.full_name || 'Đồng nghiệp'}</span>
                                                  </div>
                                                )}

                                                {/* Actions */}
                                                <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', marginTop: '0.15rem' }}>
                                                  {needsActual(report) && (
                                                    <button
                                                      className="btn btn-success"
                                                      onClick={() => handleFillActual(report)}
                                                      style={{ padding: '0.2rem 0.4rem', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', height: '24px' }}
                                                      title="Điền Tiến độ thực tế"
                                                    >
                                                      <ClipboardCheck size={11} /> Nhập thực tế
                                                    </button>
                                                  )}
                                                  <button
                                                    className="btn btn-secondary"
                                                    onClick={() => handleEdit(report)}
                                                    style={{ padding: '0.2rem 0.35rem', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', height: '24px' }}
                                                    title="Sửa báo cáo"
                                                  >
                                                    <Edit size={11} /> Sửa
                                                  </button>
                                                  <button
                                                    className="btn btn-danger"
                                                    onClick={() => handleDelete(report.id)}
                                                    style={{ padding: '0.2rem 0.35rem', borderRadius: 'var(--radius-sm)', fontSize: '0.65rem', height: '24px' }}
                                                    title="Xóa báo cáo"
                                                  >
                                                    <Trash2 size={11} /> Xóa
                                                  </button>
                                                </div>

                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
// v1.1 — thông báo lỗi hiện cạnh nút Gửi và không tự ẩn
