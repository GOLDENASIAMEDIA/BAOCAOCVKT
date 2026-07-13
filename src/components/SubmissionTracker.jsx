import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../db';
import { computeWeekNumber, buildChannelLabels, findDpCategory, isDpCategory } from '../channels';
import {
  RefreshCw, Users, CheckCircle2, AlertTriangle, CalendarCheck2,
  Check, X, TrendingUp, Search, ChevronLeft, ChevronRight, Download
} from 'lucide-react';
import * as XLSX from 'xlsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toISO = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Danh sách 7 ngày của tuần theo offset (0 = tuần này, -1 = tuần trước...), bắt đầu từ
// "Ngày bắt đầu chu kỳ" admin cấu hình trong Cài đặt (weekStartDay) — không code cứng Thứ 2 nữa
// để khớp với cách tính tuần của toàn bộ app.
const buildWeekDateList = (offset, weekStartDay = 1) => {
  const now = new Date();
  const dow = (now.getDay() - weekStartDay + 7) % 7; // 0 = ngày bắt đầu chu kỳ
  const start = new Date(now);
  start.setDate(now.getDate() - dow + offset * 7);
  const list = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    list.push(toISO(d));
  }
  return list;
};

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const formatDayHeader = (iso) => {
  const d = new Date(iso + 'T00:00:00');
  return { dow: DAY_NAMES[d.getDay()], dm: `${d.getDate()}/${d.getMonth() + 1}` };
};

// Khối lượng (địa điểm/màn hình) đã làm trên tổng kế hoạch của 1 báo cáo — dùng cho DP LCD & Tiến độ GP
const formatQty = (r, assignments = [], dpCategory = null) => {
  const parts = [];
  if (r.plan_locations != null || r.actual_locations != null) {
    let total = r.plan_locations;
    const done = r.actual_locations != null ? r.actual_locations : 0;
    if (isDpCategory(r.task_detail, dpCategory) && (total === null || total === 0)) {
      const matchAsg = assignments.find(a => a.user_id === r.user_id && isDpCategory(a.category, dpCategory) && (a.channel || 'ALL') === r.channel);
      total = matchAsg?.locations ?? null;
    }
    parts.push(total != null && total > 0 ? `${done}/${total} địa điểm` : `${done} địa điểm`);
  }
  if (r.plan_screens != null || r.actual_screens != null) {
    let total = r.plan_screens;
    const done = r.actual_screens || 0;
    if (isDpCategory(r.task_detail, dpCategory) && (total === null || total === 0)) {
      const matchAsg = assignments.find(a => a.user_id === r.user_id && isDpCategory(a.category, dpCategory) && (a.channel || 'ALL') === r.channel);
      total = matchAsg?.screens ?? null;
    }
    parts.push(total != null && total > 0 ? `${done}/${total} màn hình` : `${done} màn hình`);
  }
  return parts.join(', ');
};

// Tổng khối lượng của TẤT CẢ báo cáo trong 1 ngày (VD DP LCD trải nhiều kênh) — hiện gọn trong ô bảng
const aggregateQty = (dayReports) => {
  if (!dayReports || dayReports.length === 0) return '';
  let locDone = 0, locTotal = 0, hasLoc = false;
  let scrDone = 0, scrTotal = 0, hasScr = false;
  dayReports.forEach(r => {
    if (r.plan_locations != null || r.actual_locations != null) {
      hasLoc = true;
      locDone += (r.actual_locations || 0);
      locTotal += (r.plan_locations || 0);
    }
    if (r.plan_screens != null || r.actual_screens != null) {
      hasScr = true;
      scrDone += (r.actual_screens || 0);
      scrTotal += (r.plan_screens || 0);
    }
  });
  const parts = [];
  if (hasLoc) {
    parts.push(locTotal > 0 ? `${locDone}/${locTotal} đ.điểm` : `${locDone} đ.điểm`);
  }
  if (hasScr) {
    parts.push(scrTotal > 0 ? `${scrDone}/${scrTotal} màn` : `${scrDone} màn`);
  }
  return parts.join(' · ');
};

// Tóm tắt ngắn gọn công việc nhân viên đã làm trong 1 ngày, dùng cho chú thích trong ô
const summarizeDay = (dayReports, channelLabels, assignments = [], dpCategory = null) => {
  if (!dayReports || dayReports.length === 0) return '';
  return dayReports.map(r => {
    const chan = r.channel ? ` (${channelLabels[r.channel] || r.channel})` : '';
    const detail = r.actual_details || r.plan_details || '';
    const qty = formatQty(r, assignments, dpCategory);
    return `${r.task_detail || 'Chưa rõ hạng mục'}${chan}${qty ? ' — ' + qty : ''}${detail ? ': ' + detail : ''}`;
  }).join('\n');
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function SubmissionTracker() {
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = tuần này, -1 = tuần trước, +1 = tuần sau
  const [profiles, setProfiles] = useState([]);
  const [reports, setReports] = useState([]);
  const [search, setSearch] = useState('');
  const [channelLabels, setChannelLabels] = useState(() => buildChannelLabels());
  const [weekStartDay, setWeekStartDay] = useState(1);

  const [sysCategories, setSysCategories] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const dpCategory = useMemo(() => findDpCategory(sysCategories), [sysCategories]);

  const dateList = useMemo(() => buildWeekDateList(weekOffset, weekStartDay), [weekOffset, weekStartDay]);
  const rangeStart = dateList[0];
  const rangeEnd = dateList[dateList.length - 1];
  const todayISO = toISO(new Date());
  const weekNumber = useMemo(() => computeWeekNumber(rangeStart, weekStartDay), [rangeStart, weekStartDay]);
  const isCurrentWeek = weekOffset === 0;
  // Tuần hiện tại: chỉ tính tỷ lệ trên số ngày ĐÃ TRÔI QUA (tính cả hôm nay) — không bắt
  // nhân viên "nộp" cho những ngày chưa tới, tránh giữa tuần ai cũng bị hiện % thấp màu đỏ.
  const countableDates = useMemo(
    () => (isCurrentWeek ? dateList.filter(d => d <= todayISO) : dateList),
    [dateList, isCurrentWeek, todayISO]
  );

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profRes, repRes, settingsRes, asgRes] = await Promise.all([
        db.profiles.getAll(),
        db.reports.getAll(rangeStart, rangeEnd),
        db.settings.get(),
        db.assignments.getAll()
      ]);
      setProfiles(profRes.data || []);
      setReports(repRes.data || []);
      setChannelLabels(buildChannelLabels(settingsRes.data?.channels));
      setSysCategories(settingsRes.data?.categories || []);
      setAssignments(asgRes?.data || []);
      const cfgStart = settingsRes.data?.weekStartDay;
      if (cfgStart != null && cfgStart !== weekStartDay) setWeekStartDay(cfgStart);
    } catch (err) {
      console.error('Error loading tracking data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [weekOffset, weekStartDay]);

  // ── Build roster: employees from profiles (non-admin) ∪ report authors ──────
  const roster = useMemo(() => {
    const map = {};
    profiles.filter(p => p.role !== 'admin').forEach(p => {
      map[p.id] = { id: p.id, name: p.full_name, position: p.position || 'Nhân viên' };
    });
    reports.forEach(r => {
      if (!map[r.user_id]) {
        map[r.user_id] = {
          id: r.user_id,
          name: r.employee_name || 'Nhân viên',
          position: r.role_name || 'Kỹ thuật viên'
        };
      }
    });
    return Object.values(map);
  }, [profiles, reports]);

  // ── Gom báo cáo theo (nhân viên, ngày) — để vừa đếm số lượng vừa xem nội dung đã làm ──
  const reportsMap = useMemo(() => {
    const m = {};
    reports.forEach(r => {
      const key = `${r.user_id}|${r.date}`;
      (m[key] = m[key] || []).push(r);
    });
    return m;
  }, [reports]);

  // ── Per-employee rows with stats ────────────────────────────────────────────
  const rows = useMemo(() => {
    return roster.map(emp => {
      const cells = dateList.map(date => reportsMap[`${emp.id}|${date}`] || []);
      // Tỷ lệ chỉ tính trên các ngày đã trôi qua (countableDates) — không tính ngày tương lai
      const daysSubmitted = countableDates.filter(date => (reportsMap[`${emp.id}|${date}`] || []).length > 0).length;
      const submittedToday = (reportsMap[`${emp.id}|${todayISO}`] || []).length > 0;
      return {
        ...emp,
        cells,
        daysSubmitted,
        submittedToday,
        rate: countableDates.length > 0
          ? Math.min(100, Math.round((daysSubmitted / countableDates.length) * 100))
          : 100
      };
    }).sort((a, b) => a.rate - b.rate);
  }, [roster, reportsMap, dateList, countableDates, todayISO]);

  // Lọc theo tên — giúp tìm nhanh 1 nhân viên thay vì dò cả bảng
  const visibleRows = useMemo(() => {
    if (!search.trim()) return rows;
    const term = search.trim().toLowerCase();
    return rows.filter(r => r.name?.toLowerCase().includes(term));
  }, [rows, search]);

  const submittedTodayCount = rows.filter(r => r.submittedToday).length;
  const missingToday = rows.filter(r => !r.submittedToday);
  const fullWeekRows = rows.filter(r => r.rate === 100);
  const missingWeekRows = rows.filter(r => r.rate < 100);
  const avgRate = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.rate, 0) / rows.length)
    : 0;
  const handleExportExcel = () => {
    if (visibleRows.length === 0) { alert('Không có dữ liệu điểm danh để xuất!'); return; }
    const weekStartStr = new Date(rangeStart).toLocaleDateString('vi-VN');
    const weekEndStr = new Date(rangeEnd).toLocaleDateString('vi-VN');
    
    const headerAOA = [
      [`BẢNG ĐIỂM DANH NỘP BÁO CÁO TUẦN ${weekNumber} (${weekStartStr} - ${weekEndStr})`],
      [`Thời gian xuất: ${new Date().toLocaleString('vi-VN')}`],
      [],
      [
        'STT',
        'Họ tên nhân viên',
        'Chức vụ',
        'Tỷ lệ nộp (%)',
        ...dateList.map(date => {
          const d = new Date(date + 'T00:00:00');
          return `${DAY_NAMES[d.getDay()]} (${d.getDate()}/${d.getMonth() + 1})`;
        })
      ]
    ];
    
    const rows = visibleRows.map((emp, index) => {
      const dayCellsText = dateList.map(date => {
        const dayReports = reportsMap[`${emp.id}|${date}`] || [];
        if (dayReports.length === 0) return 'Chưa nộp';
        
        // Dùng dấu xuống dòng '\n' để khi hiển thị trong Excel các công việc sẽ tự động xuống dòng đẹp mắt
        return dayReports.map(r => {
          const chan = r.channel ? ` (${channelLabels[r.channel] || r.channel})` : '';
          const qty = formatQty(r, assignments, dpCategory);
          return `- ${r.task_detail || 'Không rõ hạng mục'}${chan}${qty ? ` [${qty}]` : ''}`;
        }).join('\n');
      });
      
      return [
        index + 1,
        emp.name,
        emp.position,
        `${emp.rate}%`,
        ...dayCellsText
      ];
    });
    
    const fullData = [...headerAOA, ...rows];
    const worksheet = XLSX.utils.aoa_to_sheet(fullData);
    
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } }
    ];
    
    // Căn chỉnh độ rộng cột rộng rãi để dễ nhìn thông tin xuống dòng
    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 22 }, // Họ tên nhân viên
      { wch: 18 }, // Chức vụ
      { wch: 16 }, // Tỷ lệ nộp
      { wch: 38 }, // Thứ 2
      { wch: 38 }, // Thứ 3
      { wch: 38 }, // Thứ 4
      { wch: 38 }, // Thứ 5
      { wch: 38 }, // Thứ 6
      { wch: 38 }, // Thứ 7
      { wch: 38 }  // Chủ nhật
    ];
    
    // Cài đặt chiều cao hàng (Row Heights), các hàng nhân viên có chiều cao lớn (45pt) để hiển thị đẹp các dòng xuống dòng
    worksheet['!rows'] = [
      { hpt: 28 }, // Tiêu đề chính
      { hpt: 16 }, // Thời gian xuất
      { hpt: 8 },  // Hàng đệm trống
      { hpt: 24 }, // Header bảng
      ...rows.map(() => ({ hpt: 45 })) // Các dòng dữ liệu nhân viên rộng rãi
    ];
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Diem_Danh_T${weekNumber}`);
    
    // Sử dụng kỹ thuật xuất HTML Table để giữ màu sắc và tự động xuống dòng trên mọi phiên bản Excel
    const htmlRaw = XLSX.write(workbook, { bookType: 'html', type: 'string' });
    const styledHtml = htmlRaw.replace(
      '<head><meta charset="utf-8"/><title>SheetJS Table Export</title></head>',
      `<head>
        <meta charset="utf-8"/>
        <style>
          table { border-collapse: collapse; margin: 10px; }
          td { border: 0.5pt solid #cccccc; padding: 6px 8px; font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; text-align: left; vertical-align: top; white-space: pre-wrap; }
          
          /* Căn lề và định dạng cột */
          td:nth-child(1), td:nth-child(4) { text-align: center; }
          
          /* Tiêu đề chính */
          tr:nth-child(1) td { font-size: 14pt; font-weight: bold; color: #222222; text-align: center; border: none; height: 35px; }
          tr:nth-child(2) td { font-size: 9pt; color: #666666; text-align: center; border: none; }
          tr:nth-child(3) td { border: none; height: 8px; }
          
          /* Bôi màu Header bảng (Màu cam Golden Asia sang trọng) */
          tr:nth-child(4) td { background-color: #d97757; color: white; font-weight: bold; text-align: center; height: 26px; }
        </style>
      </head>`
    );

    const blob = new Blob([styledHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BANG_DIEM_DANH_TUAN_${weekNumber}_${todayISO}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const missingList = isCurrentWeek ? missingToday : missingWeekRows;

  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>

      {/* ── Header controls ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
        alignItems: 'center', gap: '0.75rem', marginTop: '1.5rem'
      }}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Theo dõi tiến độ nộp báo cáo theo tuần — xem được từng ngày nhân viên đã làm gì.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="input-field"
              placeholder="Tìm nhân viên..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '2rem', paddingTop: '0.4rem', paddingBottom: '0.4rem', width: '160px' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <button className="icon-btn" onClick={() => setWeekOffset(w => w - 1)} title="Tuần trước">
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: 150, textAlign: 'center' }}>
              Tuần {weekNumber}{isCurrentWeek && <span style={{ color: 'var(--accent-color)' }}> (hiện tại)</span>}
              <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                {formatDayHeader(rangeStart).dm} – {formatDayHeader(rangeEnd).dm}
              </div>
            </span>
            <button className="icon-btn" onClick={() => setWeekOffset(w => w + 1)} title="Tuần sau">
              <ChevronRight size={16} />
            </button>
            {!isCurrentWeek && (
              <button className="time-range-btn" onClick={() => setWeekOffset(0)}>Về tuần này</button>
            )}
          </div>
          <button className="icon-btn" onClick={fetchData} title="Làm mới">
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-primary" onClick={handleExportExcel}
            style={{ height: '36px', padding: '0 0.85rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="Xuất Excel điểm danh">
            <Download size={14} /> Xuất Excel
          </button>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1rem', marginTop: '1.25rem'
      }}>
        <div className="card-glass stat-card" style={{ padding: '1.25rem' }}>
          <div className="stat-icon" style={{ width: '2.75rem', height: '2.75rem', background: 'var(--info-bg)', color: 'var(--info)' }}>
            <Users size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Tổng nhân viên</span>
            <span className="stat-value" style={{ fontSize: '1.5rem' }}>{rows.length}</span>
          </div>
        </div>

        <div className="card-glass stat-card" style={{ padding: '1.25rem' }}>
          <div className="stat-icon" style={{ width: '2.75rem', height: '2.75rem', background: 'var(--success-bg)', color: 'var(--success)' }}>
            <CheckCircle2 size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{isCurrentWeek ? 'Đã nộp hôm nay' : 'Nộp đủ tuần'}</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--success)' }}>
              {isCurrentWeek ? `${submittedTodayCount}/${rows.length}` : `${fullWeekRows.length}/${rows.length}`}
            </span>
          </div>
        </div>

        <div className="card-glass stat-card" style={{ padding: '1.25rem' }}>
          <div className="stat-icon" style={{ width: '2.75rem', height: '2.75rem', background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">{isCurrentWeek ? 'Chưa nộp hôm nay' : 'Còn thiếu ngày'}</span>
            <span className="stat-value" style={{ fontSize: '1.5rem', color: missingList.length > 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
              {missingList.length}
            </span>
          </div>
        </div>

        <div className="card-glass stat-card" style={{ padding: '1.25rem' }}>
          <div className="stat-icon" style={{ width: '2.75rem', height: '2.75rem' }}>
            <TrendingUp size={20} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Tỷ lệ nộp trung bình</span>
            <span className="stat-value" style={{ fontSize: '1.5rem' }}>{avgRate}%</span>
          </div>
        </div>
      </div>

      {/* ── Missing callout ── */}
      {!loading && missingList.length > 0 && (
        <div className="card-glass" style={{
          marginTop: '1.25rem', padding: '1rem 1.25rem',
          borderLeft: '3px solid var(--danger)',
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem'
        }}>
          <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {isCurrentWeek ? 'Chưa nộp báo cáo hôm nay:' : 'Chưa nộp đủ báo cáo tuần này:'}
          </span>
          {missingList.map(e => (
            <span key={e.id} className="badge badge-danger">{e.name}{!isCurrentWeek ? ` (${e.rate}%)` : ''}</span>
          ))}
        </div>
      )}

      {/* ── Tracking matrix ── */}
      <div className="card-glass" style={{ marginTop: '1.25rem' }}>
        <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3 className="section-title" style={{ marginBottom: 0 }}>
            <CalendarCheck2 size={16} style={{ verticalAlign: '-3px', marginRight: '0.4rem' }} />
            Bảng điểm danh nộp báo cáo
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Di chuột vào ô để xem chi tiết công việc đã làm trong ngày
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ width: '2.5rem', height: '2.5rem', color: 'var(--accent-color)' }}></div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Chưa có nhân viên hoặc báo cáo nào trong hệ thống.
          </div>
        ) : visibleRows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Không tìm thấy nhân viên nào khớp "{search}".
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="report-table tracker-table">
              <thead>
                <tr>
                  <th>Nhân viên</th>
                  {dateList.map(date => {
                    const { dow, dm } = formatDayHeader(date);
                    const isToday = date === todayISO;
                    return (
                      <th key={date} className={isToday ? 'tracker-col-today' : ''}>
                        <div style={{ color: isToday ? 'var(--accent-color)' : undefined }}>{dow}</div>
                        <div style={{ fontSize: '0.65rem', fontWeight: 400 }}>{dm}</div>
                      </th>
                    );
                  })}
                  <th>Tỷ lệ</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(emp => (
                  <tr key={emp.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <div className="user-avatar" style={{ width: '2rem', height: '2rem', fontSize: '0.8rem', flexShrink: 0 }}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{emp.name}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{emp.position}</div>
                        </div>
                      </div>
                    </td>
                    {emp.cells.map((dayReports, i) => {
                      const isToday = dateList[i] === todayISO;
                      const count = dayReports.length;
                      // Nhãn ngắn gọn: 1 việc thì ghi tên hạng mục, nhiều việc thì ghi số lượng
                      const label = count === 1
                        ? (dayReports[0].task_detail || '').slice(0, 12)
                        : count > 1 ? `${count} việc` : '';
                      const qty = aggregateQty(dayReports);
                      return (
                        <td key={dateList[i]} className={isToday ? 'tracker-col-today' : ''}
                          title={count > 0 ? summarizeDay(dayReports, channelLabels, assignments, dpCategory) : 'Chưa nộp báo cáo'}>
                          {count > 0 ? (
                            <div className="tracker-cell">
                              <span className="tracker-dot ok"><Check size={12} /></span>
                              <span className="tracker-task-label">{label}</span>
                              {qty && <span className="tracker-qty">{qty}</span>}
                            </div>
                          ) : (
                            <span className="tracker-dot miss">
                              <X size={13} />
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <span className={`badge ${emp.rate >= 70 ? 'badge-success' : emp.rate >= 40 ? 'badge-warning' : 'badge-danger'}`}>
                        {emp.rate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
// v1.1 — tỷ lệ nộp chỉ tính ngày đã qua; tuần theo cấu hình weekStartDay
