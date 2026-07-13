import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { getCurrentWeekNumber, computeWeekNumber, toLocalIsoDate, findDpCategory, DEFAULT_GOLDEN_CHANNELS, buildChannelLabels } from '../channels';
import {
  Landmark, Coffee, Scissors, Building2, Utensils, ShoppingBag, Info,
  MapPin, Monitor, Save, RefreshCw, Users, Target, Tv
} from 'lucide-react';

// Nội dung giới thiệu "Hệ Sinh Thái" ở cuối trang — thuần minh họa/marketing, KHÔNG dùng để
// tính toán số liệu (số liệu thực tế dùng danh sách kênh tùy biến trong Cài đặt, xem `channels` state).
const MARKETING_CHANNELS = [
  {
    id: 'university',
    title: 'University (Trường học)',
    icon: <Landmark size={24} />,
    desc: 'Kênh màn hình quảng cáo tại các trường đại học lớn trên toàn quốc. Tiếp cận trực tiếp đối tượng sinh viên, giảng viên năng động.',
    screens: '500+ màn hình',
    key: 'UNI'
  },
  {
    id: 'fb',
    title: 'F&B (Coffee & Dining)',
    icon: <Coffee size={24} />,
    desc: 'Hệ thống màn hình đặt tại các chuỗi quán cà phê nổi tiếng (Highlands, Phúc Long, The Coffee House...) và nhà hàng.',
    screens: '1200+ màn hình',
    key: 'CF'
  },
  {
    id: 'beauty',
    title: 'Beauty (Salon & Spa)',
    icon: <Scissors size={24} />,
    desc: 'Màn hình quảng cáo tại chuỗi làm đẹp, tóc, salon, thẩm mỹ viện (30Shine, Shynh House...). Thời gian chờ cao, tương tác tối đa.',
    screens: '800+ màn hình',
    key: 'SALON'
  },
  {
    id: 'building',
    title: 'Building (Tòa nhà)',
    icon: <Building2 size={24} />,
    desc: 'Hệ thống màn hình LCD/GP lắp đặt tại khu vực sảnh elevator, cabin thang máy các tòa nhà chung cư, văn phòng cao cấp.',
    screens: '3000+ màn hình',
    key: 'BUILDING'
  },
  {
    id: 'fastfood',
    title: 'Fast Food (Cửa hàng ăn nhanh)',
    icon: <Utensils size={24} />,
    desc: 'Kênh màn hình tại chuỗi cửa hàng thức ăn nhanh nổi tiếng (Lotteria, KFC, Jollibee...). Tần suất lặp lại cao trong ngày.',
    screens: '400+ màn hình',
    key: 'FF'
  },
  {
    id: 'supermarket',
    title: 'Supermarket & Mall',
    icon: <ShoppingBag size={24} />,
    desc: 'Màn hình LED/LCD cỡ lớn tại các đại siêu thị, trung tâm thương mại lớn (Lotte, Aeon Mall...). Kích thích mua sắm tức thì.',
    screens: '300+ màn hình',
    key: 'MALL'
  }
];

// ─── Progress bar nhỏ ─────────────────────────────────────────────────────────
function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.min(Math.round((done / total) * 100), 100) : 0;
  const color = pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--accent-color)' : 'var(--danger)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 140 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--surface-inset-strong)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 'var(--radius-full)', background: color, transition: 'width 0.5s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

export default function GoldenAsiaEcosystem({ user }) {
  const isAdmin = user?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  // Danh sách kênh hệ thống Golden — tùy biến trong Cài đặt (Admin), fallback về mặc định nếu chưa cấu hình
  const [channels, setChannels] = useState(DEFAULT_GOLDEN_CHANNELS);
  const channelLabels = useMemo(() => buildChannelLabels(channels), [channels]);
  const [assignments, setAssignments] = useState([]); // admin: tất cả; NV: của mình
  const [reports, setReports] = useState([]);
  const [edits, setEdits] = useState({});            // hạng mục thường: { category: { locations, screens } }
  const [channelEdits, setChannelEdits] = useState({}); // DP LCD theo kênh: { channelKey: { locations, screens } }
  // Nhập nhanh "Đã làm hôm nay" cho các hạng mục thường (không phải DP LCD) — { category: '12' }.
  // Khi lưu sẽ tạo/cập nhật 1 báo cáo của ngày hôm nay, không lưu số liệu rời rạc như DP LCD,
  // để luôn khớp với lịch sử báo cáo hằng ngày.
  const [quickActual, setQuickActual] = useState({});
  const [message, setMessage] = useState('');
  const [weekStartDay, setWeekStartDay] = useState(1);
  // Tuần đang khai "đã hoàn thành" DP LCD — sang tuần khác thì số này tự hiển thị lại từ 0.
  // Mặc định = tuần hiện tại (tự tính từ hôm nay), nhân viên vẫn có thể đổi để xem/nhập tuần khác.
  const [selectedWeek, setSelectedWeek] = useState(() => getCurrentWeekNumber(1));
  const [weekAutoSet, setWeekAutoSet] = useState(true); // chưa bị người dùng tự sửa tay

  // Hạng mục DP LCD (khai theo từng kênh hệ thống Golden)
  const dpCategory = useMemo(() => findDpCategory(categories), [categories]);

  const fetchData = async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    try {
      const [settingsRes, asgRes, repRes] = await Promise.all([
        db.settings.get(),
        isAdmin ? db.assignments.getAll() : db.assignments.getByUser(user.id),
        isAdmin ? db.reports.getAll() : db.reports.getByUser(user.id)
      ]);
      const cats = settingsRes.data?.categories || [];
      setCategories(cats);
      const chs = settingsRes.data?.channels;
      setChannels(chs && chs.length > 0 ? chs : DEFAULT_GOLDEN_CHANNELS);
      const wsd = settingsRes.data?.weekStartDay ?? 1;
      setWeekStartDay(wsd);
      setWeekAutoSet(prev => {
        if (prev) setSelectedWeek(getCurrentWeekNumber(wsd));
        return prev;
      });
      const asgs = asgRes.data || [];
      setAssignments(asgs);
      setReports(repRes.data || []);
    } catch (err) {
      console.error('Error loading assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [user?.id]);

  // Điền lại form nhập liệu mỗi khi có dữ liệu mới HOẶC khi đổi Tuần đang khai —
  // "Đã hoàn thành" DP LCD chỉ hiển thị lại nếu đúng tuần đã lưu, còn không thì hiển thị trống (reset) để nhập lại từ đầu.
  useEffect(() => {
    if (isAdmin) return;
    const initCats = {};
    const initChannels = {};
    assignments.forEach(a => {
      const ch = a.channel || 'ALL';
      if (dpCategory && a.category === dpCategory && ch !== 'ALL') {
        const matchesWeek = a.done_week != null && parseInt(a.done_week) === parseInt(selectedWeek);
        initChannels[ch] = {
          locations: a.locations ?? 0,
          screens: a.screens ?? 0,
          done_locations: matchesWeek ? (a.done_locations ?? 0) : ''
        };
      } else if (ch === 'ALL') {
        initCats[a.category] = { locations: a.locations ?? 0, screens: a.screens ?? 0 };
      }
    });
    setEdits(initCats);
    setChannelEdits(initChannels);
  }, [assignments, dpCategory, selectedWeek, isAdmin]);

  // Điền sẵn ô "Đã làm hôm nay" theo báo cáo CỦA HÔM NAY (nếu đã có) cho từng hạng mục thường —
  // để nhân viên thấy đúng số đã nhập trước đó thay vì trống, và có thể sửa lại nếu cần.
  useEffect(() => {
    if (isAdmin) return;
    const todayISO = toLocalIsoDate();
    const init = {};
    categories.filter(cat => !dpCategory || cat !== dpCategory).forEach(cat => {
      const todayReport = reports.find(r => r.task_detail === cat && r.date === todayISO && r.user_id === user?.id);
      if (todayReport) {
        init[cat] = todayReport.actual_locations != null ? String(todayReport.actual_locations) : '';
      }
    });
    setQuickActual(init);
  }, [reports, categories, dpCategory, isAdmin, user?.id]);

  const handleQuickActualChange = (category, value) => {
    setQuickActual(prev => ({ ...prev, [category]: value }));
  };

  // Thực tế đã làm (số địa điểm/màn hình) theo hạng mục — từ báo cáo
  const doneByCategory = useMemo(() => {
    const m = {};
    reports.forEach(r => {
      const cat = r.task_detail;
      if (!cat) return;
      if (!m[cat]) m[cat] = { locations: 0, screens: 0 };
      m[cat].locations += (r.actual_locations || 0);
      m[cat].screens += (r.actual_screens || 0);
    });
    return m;
  }, [reports]);

  // Admin: thực tế đã làm theo (user, category)
  const doneByUserCategory = useMemo(() => {
    const m = {};
    reports.forEach(r => {
      if (!r.task_detail) return;
      const key = `${r.user_id}|${r.task_detail}`;
      m[key] = (m[key] || 0) + (r.actual_locations || 0);
    });
    return m;
  }, [reports]);

  // Nhân viên nào đã NỘP BÁO CÁO cho hạng mục nào — dùng để admin vẫn thấy tiến độ ngay cả khi
  // nhân viên chưa khai "Địa điểm phụ trách" (Tổng) mà chỉ nhập nhanh "Đã làm hôm nay" ở tab này.
  const reportingUsersByCategory = useMemo(() => {
    const m = {};
    reports.forEach(r => {
      if (!r.task_detail) return;
      if (!m[r.task_detail]) m[r.task_detail] = new Set();
      m[r.task_detail].add(r.user_id);
    });
    return m;
  }, [reports]);

  // Nếu nhân viên không nhập số lượng phụ trách (locations = 0 / trống) cho 1 kênh/hạng mục,
  // coi như họ KHÔNG sở hữu kênh/hạng mục đó — không tính vào số liệu, không liệt kê ra danh sách.
  const ownedAssignments = useMemo(() => assignments.filter(a => (a.locations || 0) > 0), [assignments]);

  // Admin: tổng hợp theo hạng mục (các dòng kênh tự cộng dồn vào hạng mục)
  const adminSummary = useMemo(() => {
    if (!isAdmin) return [];
    const m = {};
    ownedAssignments.forEach(a => {
      if (!m[a.category]) m[a.category] = { category: a.category, locations: 0, screens: 0, members: new Set() };
      m[a.category].locations += (a.locations || 0);
      m[a.category].screens += (a.screens || 0);
      m[a.category].members.add(a.user_id);
    });
    // DP LCD: "đã làm" lấy từ số ĐÃ HOÀN THÀNH nhân viên tự khai theo kênh;
    // các hạng mục khác: cộng từ báo cáo hằng ngày
    const doneFromChannels = {};
    ownedAssignments.forEach(a => {
      if ((a.channel || 'ALL') !== 'ALL') {
        doneFromChannels[a.category] = (doneFromChannels[a.category] || 0) + (a.done_locations || 0);
      }
    });
    // Bổ sung các hạng mục đã CÓ BÁO CÁO thực tế nhưng chưa từng khai "Địa điểm phụ trách" (Tổng) —
    // nếu không sẽ bị loại khỏi bảng này hoàn toàn dù nhân viên đã nhập tiến độ (VD dùng ô "Đã làm
    // hôm nay" ở bảng bên dưới mà chưa điền số Tổng), khiến admin không thấy tiến độ.
    Object.keys(doneByCategory).forEach(cat => {
      if (dpCategory && cat === dpCategory) return;
      if (!m[cat]) {
        m[cat] = { category: cat, locations: 0, screens: 0, members: new Set() };
      }
      (reportingUsersByCategory[cat] || new Set()).forEach(uid => m[cat].members.add(uid));
    });
    return Object.values(m).map(row => ({
      ...row,
      members: row.members.size,
      done: (dpCategory && row.category === dpCategory)
        ? (doneFromChannels[row.category] || 0)
        : (doneByCategory[row.category]?.locations || 0)
    })).sort((a, b) => b.locations - a.locations);
  }, [isAdmin, ownedAssignments, doneByCategory, dpCategory, reportingUsersByCategory]);

  // Admin: DP LCD phân rã theo kênh hệ thống Golden
  const adminDpByChannel = useMemo(() => {
    if (!isAdmin || !dpCategory) return [];
    const m = {};
    ownedAssignments.filter(a => a.category === dpCategory && (a.channel || 'ALL') !== 'ALL').forEach(a => {
      const ch = a.channel;
      if (!m[ch]) m[ch] = { channel: ch, locations: 0, screens: 0, done: 0, members: new Set() };
      m[ch].locations += (a.locations || 0);
      m[ch].screens += (a.screens || 0);
      m[ch].done += (a.done_locations || 0);
      m[ch].members.add(a.user_id);
    });
    return channels
      .filter(c => m[c.key])
      .map(c => ({ ...m[c.key], label: c.title, members: m[c.key].members.size }));
  }, [isAdmin, dpCategory, ownedAssignments, channels]);

  // Admin: nhân viên nào đang sở hữu (đã nhập số lượng > 0) những kênh hệ thống Golden nào —
  // gộp theo nhân viên để xem nhanh "ai phụ trách kênh gì" thay vì phải lọc từng dòng.
  const employeeChannelMap = useMemo(() => {
    if (!isAdmin) return [];
    const m = {};
    ownedAssignments.forEach(a => {
      const key = a.user_id;
      if (!m[key]) m[key] = { employee_name: a.employee_name, rows: [] };
      const ch = a.channel || 'ALL';
      const done = ch !== 'ALL' ? (a.done_locations || 0) : (doneByUserCategory[`${a.user_id}|${a.category}`] || 0);
      m[key].rows.push({ ...a, ch, done });
    });
    return Object.values(m)
      .map(emp => ({
        ...emp,
        // Danh sách kênh hệ thống Golden (không tính hạng mục khai chung "ALL") mà nhân viên này đang sở hữu
        ownedChannels: [...new Set(emp.rows.filter(r => r.ch !== 'ALL').map(r => r.ch))]
      }))
      .sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''));
  }, [isAdmin, ownedAssignments, doneByUserCategory]);

  // Admin: tiến độ DP LCD THEO TỪNG TUẦN — tổng hợp từ các báo cáo thực tế đã nộp theo tuần
  // (tuần được tự tính từ ngày báo cáo, theo chu kỳ đã cấu hình). Giúp admin theo dõi vòng lặp
  // tiến độ hằng tuần thay vì chỉ xem số tổng cộng dồn.
  const adminWeeklyProgress = useMemo(() => {
    if (!isAdmin || !dpCategory) return [];
    const targetByChannel = {};
    ownedAssignments.forEach(a => {
      if (a.category === dpCategory && (a.channel || 'ALL') !== 'ALL') {
        targetByChannel[a.channel] = (targetByChannel[a.channel] || 0) + (a.locations || 0);
      }
    });
    const totalTarget = Object.values(targetByChannel).reduce((s, v) => s + v, 0);

    const weeks = [...new Set(
      reports.filter(r => r.task_detail === dpCategory && r.week != null).map(r => r.week)
    )].sort((a, b) => b - a);

    return weeks.map(wk => {
      const doneByChannel = {};
      reports.filter(r => r.task_detail === dpCategory && r.week === wk).forEach(r => {
        if (!r.channel) return;
        doneByChannel[r.channel] = (doneByChannel[r.channel] || 0) + (r.actual_locations || 0);
      });
      const totalDone = Object.values(doneByChannel).reduce((s, v) => s + v, 0);
      return { week: wk, doneByChannel, totalDone, totalTarget };
    });
  }, [isAdmin, dpCategory, reports, assignments]);

  const handleEditChange = (category, field, value) => {
    setEdits(prev => ({
      ...prev,
      [category]: { locations: 0, screens: 0, ...prev[category], [field]: value }
    }));
  };

  const handleChannelChange = (channelKey, field, value) => {
    setChannelEdits(prev => ({
      ...prev,
      [channelKey]: { locations: 0, screens: 0, ...prev[channelKey], [field]: value }
    }));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Các hạng mục thường (khai chung, channel = 'ALL')
      for (const [category, values] of Object.entries(edits)) {
        if (dpCategory && category === dpCategory) continue; // DP LCD khai theo kênh
        const { error } = await db.assignments.upsert(user.id, category, values, 'ALL');
        if (error) throw error;
      }
      // 2. DP LCD: từng kênh hệ thống Golden
      if (dpCategory) {
        const todayISO = toLocalIsoDate();
        for (const [channelKey, values] of Object.entries(channelEdits)) {
          const { error } = await db.assignments.upsert(user.id, dpCategory, { ...values, week: selectedWeek }, channelKey);
          if (error) throw error;

          // Đồng bộ báo cáo cho admin: bảng này trước đây chỉ lưu vào assignments (không ai ngoài
          // nhân viên thấy được), nên nếu "Đã hoàn thành" tăng so với trước, ghi nhận phần tăng thêm
          // thành 1 báo cáo của hôm nay — để admin, lịch sử báo cáo & bảng điểm danh đều thấy tiến độ
          // này, giống hệt khi nhập qua form "Báo cáo của tôi" mỗi ngày.
          const prevAssignment = assignments.find(a => a.category === dpCategory && (a.channel || 'ALL') === channelKey);
          const matchesWeek = prevAssignment?.done_week != null && parseInt(prevAssignment.done_week) === parseInt(selectedWeek);
          const previousDone = matchesWeek ? (prevAssignment?.done_locations || 0) : 0;
          const newDone = parseInt(values.done_locations) || 0;
          const delta = newDone - previousDone;
          if (delta > 0) {
            const { error: repError } = await db.reports.create({
              user_id: user.id,
              week: selectedWeek,
              date: todayISO,
              channel: channelKey,
              task_detail: dpCategory,
              plan_locations: null,
              plan_screens: null,
              plan_details: null,
              actual_locations: delta,
              actual_screens: null,
              actual_details: null,
              progress_eval: 'Đang thực hiện',
              notes: 'Cập nhật nhanh từ tab Kênh dịch vụ Golden Asia',
              custom_data: null
            });
            if (repError) throw repError;
          }
        }
      }
      // 3. Nhập nhanh "Đã làm hôm nay" cho các hạng mục thường — ghi thành 1 báo cáo của ngày hôm nay
      // (tạo mới nếu chưa có, cập nhật nếu đã có), để luôn khớp với lịch sử báo cáo hằng ngày thay vì
      // lưu số liệu riêng lẻ như DP LCD.
      if (!isAdmin) {
        const todayISO = toLocalIsoDate();
        const todayWeek = computeWeekNumber(todayISO, weekStartDay);
        for (const [category, rawVal] of Object.entries(quickActual)) {
          if (dpCategory && category === dpCategory) continue;
          if (rawVal === '' || rawVal == null) continue;
          const actual = Math.max(0, parseInt(rawVal) || 0);
          const assignedTotal = parseInt(edits[category]?.locations) || 0;
          const existing = reports.find(r => r.task_detail === category && r.date === todayISO && r.user_id === user.id);
          const payload = {
            user_id: user.id,
            week: todayWeek,
            date: todayISO,
            channel: null,
            task_detail: category,
            plan_locations: assignedTotal > 0 ? assignedTotal : (existing?.plan_locations ?? null),
            plan_screens: existing?.plan_screens ?? null,
            plan_details: existing?.plan_details ?? null,
            actual_locations: actual,
            actual_screens: existing?.actual_screens ?? null,
            actual_details: existing?.actual_details ?? null,
            progress_eval: assignedTotal > 0 && actual >= assignedTotal ? 'Hoàn thành' : 'Đang thực hiện',
            notes: existing?.notes ?? null,
            custom_data: existing?.custom_data ?? null
          };
          if (existing) {
            const { error } = await db.reports.update(existing.id, payload);
            if (error) throw error;
          } else {
            const { error } = await db.reports.create(payload);
            if (error) throw error;
          }
        }
      }
      setMessage('Đã lưu số lượng phụ trách thành công!');
      setTimeout(() => setMessage(''), 4000);
      fetchData();
    } catch (err) {
      console.error(err);
      setMessage('Có lỗi khi lưu, vui lòng thử lại!');
      setTimeout(() => setMessage(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  // Tổng DP LCD của nhân viên (cộng các kênh)
  const dpTotals = useMemo(() => {
    let locations = 0, screens = 0, done = 0;
    Object.values(channelEdits).forEach(v => {
      locations += parseInt(v.locations) || 0;
      screens += parseInt(v.screens) || 0;
      done += parseInt(v.done_locations) || 0;
    });
    return { locations, screens, done };
  }, [channelEdits]);

  // Tổng tất cả của nhân viên hiện tại
  const myTotals = useMemo(() => {
    if (isAdmin) return null;
    let locations = dpTotals.locations, screens = dpTotals.screens;
    Object.entries(edits).forEach(([cat, v]) => {
      if (dpCategory && cat === dpCategory) return;
      locations += parseInt(v.locations) || 0;
      screens += parseInt(v.screens) || 0;
    });
    return { locations, screens };
  }, [edits, dpTotals, isAdmin, dpCategory]);

  // Tiến độ DP LCD = số địa điểm ĐÃ HOÀN THÀNH nhân viên tự cập nhật theo kênh
  const dpDone = dpTotals.done;

  return (
    <div className="container" style={{ paddingBottom: '3rem', marginTop: '2rem' }}>

      {/* ════════ KHU VỰC PHỤ TRÁCH & TIẾN ĐỘ ════════ */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" style={{ width: '2.5rem', height: '2.5rem', color: 'var(--accent-color)' }}></div>
        </div>
      ) : isAdmin ? (
        /* ── ADMIN ── */
        <div className="card-glass" style={{ marginBottom: '2rem' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 className="section-title flex-align" style={{ marginBottom: 0 }}>
              <Target size={18} style={{ color: 'var(--accent-color)' }} />
              Tổng số lượng phụ trách & tiến độ
            </h3>
            <button className="icon-btn" onClick={fetchData} title="Làm mới"><RefreshCw size={15} /></button>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            {dpCategory ? `${dpCategory.trim()}: tiến độ = địa điểm đã hoàn thành / địa điểm có sẵn của từng kênh (VD: FF 8/8). ` : ''}
            Các hạng mục khác: tiến độ tính từ số địa điểm thực tế trong báo cáo hằng ngày.
          </p>

          {/* DP LCD theo kênh hệ thống Golden */}
          {dpCategory && adminDpByChannel.length > 0 && (
            <>
              <h4 style={{ fontSize: '0.9rem', marginTop: '1.25rem', color: 'var(--text-secondary)' }}>
                <Tv size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
                {dpCategory.trim()} — phân bổ theo kênh hệ thống Golden
              </h4>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Kênh hệ thống</th>
                      <th style={{ textAlign: 'center' }}>NV phụ trách</th>
                      <th style={{ textAlign: 'center' }}>Đ.điểm / Đã HT</th>
                      <th style={{ textAlign: 'center' }}>Màn hình ĐK</th>
                      <th>Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminDpByChannel.map(row => (
                      <tr key={row.channel}>
                        <td style={{ fontWeight: 600 }}>{row.label}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="flex-align" style={{ justifyContent: 'center', gap: '0.3rem' }}>
                            <Users size={13} style={{ color: 'var(--text-muted)' }} /> {row.members}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>
                          <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{row.locations} / </span>
                          <span style={{ color: 'var(--success)' }}>{row.done}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{row.screens}</td>
                        <td><ProgressBar done={row.done} total={row.locations} /></td>
                      </tr>
                    ))}
                    <tr style={{ background: 'var(--surface-inset)' }}>
                      <td style={{ fontWeight: 700 }}>TỔNG {dpCategory.trim()}</td>
                      <td></td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{adminDpByChannel.reduce((s, r) => s + r.locations, 0)} / </span>
                        <span style={{ color: 'var(--success)' }}>{adminDpByChannel.reduce((s, r) => s + r.done, 0)}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent-color)' }}>
                        {adminDpByChannel.reduce((s, r) => s + r.screens, 0)}
                      </td>
                      <td>
                        <ProgressBar
                          done={adminDpByChannel.reduce((s, r) => s + r.done, 0)}
                          total={adminDpByChannel.reduce((s, r) => s + r.locations, 0)} />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Tiến độ DP LCD theo từng tuần — vòng lặp chu kỳ tuần (T7/CN tự tính vào tuần Thứ 2 kế tiếp) */}
          {dpCategory && adminWeeklyProgress.length > 0 && (
            <>
              <h4 style={{ fontSize: '0.9rem', marginTop: '1.5rem', color: 'var(--text-secondary)' }}>
                <Tv size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
                {dpCategory.trim()} — tiến độ theo từng tuần
              </h4>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Tuần hiện tại: <strong>Tuần {getCurrentWeekNumber(weekStartDay)}</strong>. Số "đã hoàn thành" lấy từ báo cáo thực tế nhân viên nộp trong tuần đó.
              </p>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Tuần</th>
                      <th style={{ textAlign: 'center' }}>Đã HT / Mục tiêu</th>
                      <th>Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminWeeklyProgress.map(row => {
                      const isCurrent = row.week === getCurrentWeekNumber(weekStartDay);
                      return (
                        <tr key={row.week} style={isCurrent ? { background: 'var(--accent-glow)' } : undefined}>
                          <td style={{ fontWeight: 700 }}>
                            Tuần {row.week}
                            {isCurrent && <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>Hiện tại</span>}
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            <span style={{ color: 'var(--success)' }}>{row.totalDone}</span>
                            <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {row.totalTarget}</span>
                          </td>
                          <td><ProgressBar done={row.totalDone} total={row.totalTarget} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Tổng hợp theo hạng mục */}
          {adminSummary.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Chưa có nhân viên nào khai báo số lượng phụ trách.
            </div>
          ) : (
            <>
              <h4 style={{ fontSize: '0.9rem', marginTop: '1.5rem', color: 'var(--text-secondary)' }}>
                Tiến độ theo hạng mục công việc
              </h4>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Hạng mục</th>
                      <th style={{ textAlign: 'center' }}>NV phụ trách</th>
                      <th style={{ textAlign: 'center' }}>Địa điểm ĐK</th>
                      <th style={{ textAlign: 'center' }}>Màn hình ĐK</th>
                      <th style={{ textAlign: 'center' }}>Đã làm (Đ.điểm)</th>
                      <th>Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminSummary.map(row => (
                      <tr key={row.category}>
                        <td><span className="badge badge-info">{row.category}</span></td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="flex-align" style={{ justifyContent: 'center', gap: '0.3rem' }}>
                            <Users size={13} style={{ color: 'var(--text-muted)' }} /> {row.members}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 700 }}>{row.locations}</td>
                        <td style={{ textAlign: 'center' }}>{row.screens}</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--success)' }}>{row.done}</td>
                        <td><ProgressBar done={row.done} total={row.locations} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Nhân viên nào đang sở hữu (đã nhập số lượng > 0) kênh nào — xem nhanh không cần lọc từng dòng */}
              {dpCategory && employeeChannelMap.some(e => e.ownedChannels.length > 0) && (
                <>
                  <h4 style={{ fontSize: '0.9rem', marginTop: '1.5rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                    Nhân viên đang sở hữu kênh nào ({dpCategory.trim()})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {employeeChannelMap.filter(e => e.ownedChannels.length > 0).map(emp => (
                      <div key={emp.employee_name} style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
                        padding: '0.6rem 0.85rem', background: 'var(--surface-inset)',
                        border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)'
                      }}>
                        <strong style={{ minWidth: 140 }}>{emp.employee_name}</strong>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          {emp.ownedChannels.map(chKey => (
                            <span key={chKey} className="badge badge-info" style={{ fontSize: '0.72rem' }}>
                              {channelLabels[chKey] || chKey}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Chi tiết theo từng nhân viên (nhóm theo nhân viên, chỉ liệt kê kênh/hạng mục ĐÃ nhập số lượng) */}
              <h4 style={{ fontSize: '0.9rem', marginTop: '1.5rem', marginBottom: '0.25rem', color: 'var(--text-secondary)' }}>
                Chi tiết theo từng nhân viên
              </h4>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Hạng mục</th>
                      <th>Kênh</th>
                      <th style={{ textAlign: 'center' }}>Địa điểm ĐK</th>
                      <th style={{ textAlign: 'center' }}>Màn hình ĐK</th>
                      <th style={{ textAlign: 'center' }}>Đã làm (Đ.điểm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeChannelMap.length === 0 ? (
                      <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>Chưa có nhân viên nào nhập số lượng phụ trách.</td></tr>
                    ) : employeeChannelMap.map(emp => (
                      <React.Fragment key={emp.employee_name}>
                        <tr>
                          <td colSpan={5} style={{
                            background: 'var(--surface-inset)', fontWeight: 700, fontSize: '0.85rem',
                            padding: '0.5rem 0.75rem', color: 'var(--accent-color)'
                          }}>
                            {emp.employee_name}
                          </td>
                        </tr>
                        {emp.rows
                          .slice()
                          .sort((a, b) => a.category.localeCompare(b.category))
                          .map(a => (
                            <tr key={a.id}>
                              <td><span className="badge badge-info">{a.category}</span></td>
                              <td style={{ fontSize: '0.8rem', color: a.ch === 'ALL' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                                {channelLabels[a.ch] || a.ch}
                              </td>
                              <td style={{ textAlign: 'center', fontWeight: 700 }}>{a.locations}</td>
                              <td style={{ textAlign: 'center' }}>{a.screens}</td>
                              <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>{a.done}</td>
                            </tr>
                          ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── NHÂN VIÊN ── */
        <div className="card-glass" style={{ marginBottom: '2rem' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 className="section-title flex-align" style={{ marginBottom: 0 }}>
              <Target size={18} style={{ color: 'var(--accent-color)' }} />
              Số lượng tôi phụ trách
            </h3>
            {myTotals && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Tổng: <strong style={{ color: 'var(--accent-color)' }}><MapPin size={12} style={{ verticalAlign: '-2px' }} /> {myTotals.locations} địa điểm</strong>
                {' • '}
                <strong><Monitor size={12} style={{ verticalAlign: '-2px' }} /> {myTotals.screens} màn hình</strong>
              </span>
            )}
          </div>

          {message && (
            <div style={{
              background: message.includes('lỗi') ? 'var(--danger-bg)' : 'var(--success-bg)',
              color: message.includes('lỗi') ? 'var(--danger)' : 'var(--success)',
              padding: '0.6rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginTop: '0.75rem'
            }}>
              {message}
            </div>
          )}

          {/* ── DP LCD: khai theo từng kênh hệ thống Golden ── */}
          {dpCategory && (
            <>
              <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '1.25rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: 0 }}>
                  <Tv size={14} style={{ verticalAlign: '-2px', marginRight: '0.35rem' }} />
                  {dpCategory.trim()} — nhập số hệ thống phụ trách theo từng kênh Golden
                </h4>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Tuần
                  <input type="number" min="1" className="input-field"
                    value={selectedWeek}
                    onChange={(e) => { setWeekAutoSet(false); setSelectedWeek(parseInt(e.target.value) || 0); }}
                    style={{ width: 64, padding: '0.3rem 0.5rem', textAlign: 'center' }} />
                  {weekAutoSet && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(tuần hiện tại)</span>
                  )}
                </label>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                "Đã hoàn thành" được tính riêng theo từng tuần — sang tuần mới, số này sẽ tự hiển thị lại từ đầu để bạn nhập lại.
                Khi bấm Lưu, phần tăng thêm sẽ tự ghi thành 1 báo cáo của hôm nay để admin & lịch sử báo cáo cũng thấy được.
              </p>
              <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>Kênh hệ thống</th>
                      <th style={{ textAlign: 'center' }}>Địa điểm phụ trách</th>
                      <th style={{ textAlign: 'center' }}>Đã hoàn thành</th>
                      <th style={{ textAlign: 'center' }}>Màn hình phụ trách</th>
                      <th>Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map(ch => {
                      const values = channelEdits[ch.key] || { locations: '', screens: '', done_locations: '' };
                      const assigned = parseInt(values.locations) || 0;
                      const done = parseInt(values.done_locations) || 0;
                      const rawAsg = assignments.find(x => x.category === dpCategory && (x.channel || 'ALL') === ch.key);
                      const wasReset = rawAsg && rawAsg.done_week != null && parseInt(rawAsg.done_week) !== parseInt(selectedWeek);
                      return (
                        <tr key={ch.key}>
                          <td style={{ fontWeight: 600 }}>
                            {ch.title}
                            <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.65rem' }}>{ch.key}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="input-field"
                              value={values.locations ?? ''}
                              onChange={(e) => handleChannelChange(ch.key, 'locations', e.target.value)}
                              style={{ width: 80, padding: '0.4rem 0.5rem', textAlign: 'center' }} placeholder="0" />
                          </td>
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <input type="number" min="0" max={assigned > 0 ? assigned : undefined} className="input-field"
                              value={values.done_locations ?? ''}
                              onChange={(e) => handleChannelChange(ch.key, 'done_locations', e.target.value)}
                              style={{
                                width: 80, padding: '0.4rem 0.5rem', textAlign: 'center',
                                borderColor: assigned > 0 && done >= assigned ? 'var(--success)' : undefined
                              }} placeholder="0" />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.35rem' }}>/ {assigned}</span>
                            {wasReset && (
                              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                                Tuần {rawAsg.done_week}: đã HT {rawAsg.done_locations || 0} — tuần {selectedWeek} nhập lại từ đầu
                              </div>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" min="0" className="input-field"
                              value={values.screens ?? ''}
                              onChange={(e) => handleChannelChange(ch.key, 'screens', e.target.value)}
                              style={{ width: 80, padding: '0.4rem 0.5rem', textAlign: 'center' }} placeholder="0" />
                          </td>
                          <td>
                            {assigned > 0
                              ? <ProgressBar done={done} total={assigned} />
                              : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                    <tr style={{ background: 'var(--surface-inset)' }}>
                      <td style={{ fontWeight: 700 }}>TỔNG {dpCategory.trim()}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent-color)' }}>{dpTotals.locations}</td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        <span style={{ color: 'var(--success)' }}>{dpTotals.done}</span>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {dpTotals.locations}</span>
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent-color)' }}>{dpTotals.screens}</td>
                      <td>
                        {dpTotals.locations > 0
                          ? <ProgressBar done={dpDone} total={dpTotals.locations} />
                          : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Nhập số phụ trách để tính</span>}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* ── Các hạng mục còn lại: khai chung ── */}
          <h4 style={{ fontSize: '0.9rem', marginTop: '1.5rem', color: 'var(--text-secondary)' }}>
            Các hạng mục khác
          </h4>
          <div className="table-wrapper" style={{ marginTop: '0.5rem' }}>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Hạng mục</th>
                  <th style={{ textAlign: 'center' }}>Địa điểm phụ trách</th>
                  <th style={{ textAlign: 'center' }}>Màn hình phụ trách</th>
                  <th style={{ textAlign: 'center' }}>Đã làm hôm nay</th>
                  <th style={{ textAlign: 'center' }}>Tổng đã làm (Đ.điểm)</th>
                  <th>Tiến độ</th>
                </tr>
              </thead>
              <tbody>
                {categories.filter(cat => !dpCategory || cat !== dpCategory).map(cat => {
                  const values = edits[cat] || { locations: '', screens: '' };
                  const done = doneByCategory[cat]?.locations || 0;
                  const assigned = parseInt(values.locations) || 0;
                  return (
                    <tr key={cat}>
                      <td><span className="badge badge-info">{cat}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="number" min="0" className="input-field"
                          value={values.locations ?? ''}
                          onChange={(e) => handleEditChange(cat, 'locations', e.target.value)}
                          style={{ width: 90, padding: '0.4rem 0.5rem', textAlign: 'center' }} placeholder="0" />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="number" min="0" className="input-field"
                          value={values.screens ?? ''}
                          onChange={(e) => handleEditChange(cat, 'screens', e.target.value)}
                          style={{ width: 90, padding: '0.4rem 0.5rem', textAlign: 'center' }} placeholder="0" />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input type="number" min="0" className="input-field"
                          value={quickActual[cat] ?? ''}
                          onChange={(e) => handleQuickActualChange(cat, e.target.value)}
                          placeholder="0"
                          style={{ width: 90, padding: '0.4rem 0.5rem', textAlign: 'center' }} />
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 700 }}>{done}</td>
                      <td>{assigned > 0 ? <ProgressBar done={done} total={assigned} /> : <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Nhập "Đã làm hôm nay" rồi bấm Lưu — hệ thống tự tạo/cập nhật báo cáo của hôm nay cho hạng mục đó,
            không cần vào tab Báo cáo của tôi để nhập lại.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSaveAll} disabled={saving}>
              {saving ? <div className="spinner"></div> : <><Save size={16} /> Lưu số lượng phụ trách</>}
            </button>
          </div>
        </div>
      )}

      {/* ════════ GIỚI THIỆU HỆ SINH THÁI ════════ */}
      <div className="card-glass" style={{ marginBottom: '2rem' }}>
        <h3 className="section-title flex-align">
          <Info size={20} style={{ color: 'var(--accent-color)' }} />
          Hệ Sinh Thái Quảng Cáo OOH Golden Asia
        </h3>
        <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem', maxWidth: '800px' }}>
          Golden Asia sở hữu hệ sinh thái quảng cáo ngoài trời kỹ thuật số (DOOH) phủ sóng rộng khắp Việt Nam,
          hoạt động theo mô hình <strong>The Circle of Advertising Life</strong> - đồng hành cùng khách hàng tại mọi điểm chạm trong ngày.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
        {MARKETING_CHANNELS.map(channel => (
          <div key={channel.id} className="card-glass" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderLeft: '4px solid var(--accent-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: '3rem',
                height: '3rem',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--accent-glow)',
                color: 'var(--accent-color)'
              }}>
                {channel.icon}
              </div>
              <div>
                <h4 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{channel.title}</h4>
                <span className="badge badge-info" style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>
                  Ký hiệu: {channel.key}
                </span>
              </div>
            </div>

            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', flex: 1 }}>
              {channel.desc}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-glass)', paddingTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <span>Quy mô ước tính:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{channel.screens}</strong>
            </div>
          </div>
        ))}
      </div>

      <div className="card-glass" style={{ marginTop: '2rem', textAlign: 'center', background: 'linear-gradient(135deg, rgba(217, 119, 87, 0.07) 0%, var(--bg-glass) 100%)' }}>
        <h4 style={{ color: 'var(--accent-color)', marginBottom: '0.5rem' }}>Mục tiêu quản lý kỹ thuật</h4>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '700px', margin: '0 auto' }}>
          Đảm bảo 100% thời gian hoạt động (uptime) của hệ thống màn hình phát sóng tại các kênh đối tác.
          Báo cáo hàng ngày là cơ sở để đội ngũ kỹ thuật theo dõi bảo trì, lắp đặt và xử lý sự cố tức thì.
        </p>
      </div>
    </div>
  );
}
