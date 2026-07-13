import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../db';
import TimeRangeFilter from './TimeRangeFilter';
import {
  Download, Search, RefreshCw, Users, MapPin, Monitor, Calendar,
  ChevronDown, ChevronUp, Eye, X, TrendingUp, TrendingDown, Minus,
  CheckCircle2, AlertTriangle, Clock, HelpCircle, User, ArrowLeft,
  BarChart3, ListFilter, ChevronRight, Database, Edit, Trash2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import { isSupabaseConfigured } from '../supabase';
import { hasDpReason, buildChannelLabels, toLocalIsoDate, dayLabel, findDpCategory, isDpCategory } from '../channels';

// ─── Gom nhiều báo cáo CÙNG (nhân viên, ngày, hạng mục) thành 1 dòng hiển thị ──────────────
// 1 hạng mục có nhiều kênh (VD DP LCD 6 kênh/ngày) sẽ ra 6 báo cáo riêng trong DB — gộp lại
// tránh liệt kê dư thừa nhiều dòng giống nhau, dùng chung cho cả bảng tổng hợp lẫn modal chi tiết.
function groupReportRows(reports) {
  const map = {};
  reports.forEach(r => {
    const key = `${r.user_id}|${r.date}|${r.task_detail}`;
    if (!map[key]) {
      map[key] = {
        key, user_id: r.user_id, employee_name: r.employee_name, role_name: r.role_name,
        date: r.date, week: r.week, task_detail: r.task_detail, entries: []
      };
    }
    map[key].entries.push(r);
  });
  return Object.values(map).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// ─── Sub-component: Modal sửa 1 báo cáo (dành cho admin) ──────────────────────────────────
// Cho phép admin sửa trực tiếp 1 báo cáo của nhân viên (VD nhân viên nhập sai số liệu) mà
// không cần nhờ nhân viên tự sửa lại — chỉ sửa số liệu/đánh giá/ghi chú, không đổi ngày/tuần.
function AdminEditReportModal({ report, channelLabels = {}, onClose, onSaved }) {
  const [form, setForm] = useState({
    task_detail: report.task_detail || '',
    plan_locations: report.plan_locations ?? '',
    plan_screens: report.plan_screens ?? '',
    plan_details: report.plan_details || '',
    actual_locations: report.actual_locations ?? '',
    actual_screens: report.actual_screens ?? '',
    actual_details: report.actual_details || '',
    progress_eval: report.progress_eval || 'Hoàn thành',
    notes: report.notes || ''
  });
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    try {
      const payload = {
        task_detail: form.task_detail,
        plan_locations: form.plan_locations !== '' ? Math.max(0, parseInt(form.plan_locations) || 0) : null,
        plan_screens: form.plan_screens !== '' ? Math.max(0, parseInt(form.plan_screens) || 0) : null,
        plan_details: form.plan_details || null,
        actual_locations: form.actual_locations !== '' ? Math.max(0, parseInt(form.actual_locations) || 0) : null,
        actual_screens: form.actual_screens !== '' ? Math.max(0, parseInt(form.actual_screens) || 0) : null,
        actual_details: form.actual_details || null,
        progress_eval: form.progress_eval,
        notes: form.notes || null
      };
      const { error } = await db.reports.update(report.id, payload);
      if (error) throw error;
      onSaved();
    } catch (err) {
      console.error(err);
      setErrorMsg('Không thể lưu, vui lòng thử lại!');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      padding: '3rem 1rem', overflowY: 'auto'
    }}>
      <div className="card-glass" style={{ width: '100%', maxWidth: 560, animation: 'slideUp 0.3s ease' }}>
        <div className="flex-between" style={{ marginBottom: '1rem' }}>
          <div>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Sửa báo cáo</h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {report.employee_name} • {new Date(report.date).toLocaleDateString('vi-VN')}
              {report.channel ? ` • ${channelLabels[report.channel] || report.channel}` : ''}
            </span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div className="form-group">
            <label className="form-label">Loại công việc</label>
            <input className="input-field" value={form.task_detail}
              onChange={(e) => handleChange('task_detail', e.target.value)} required />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">KH - Địa điểm</label>
              <input type="number" min="0" className="input-field" value={form.plan_locations}
                onChange={(e) => handleChange('plan_locations', e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">KH - Màn hình</label>
              <input type="number" min="0" className="input-field" value={form.plan_screens}
                onChange={(e) => handleChange('plan_screens', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">TT - Địa điểm</label>
              <input type="number" min="0" className="input-field" value={form.actual_locations}
                onChange={(e) => handleChange('actual_locations', e.target.value)} placeholder="0" />
            </div>
            <div className="form-group">
              <label className="form-label">TT - Màn hình</label>
              <input type="number" min="0" className="input-field" value={form.actual_screens}
                onChange={(e) => handleChange('actual_screens', e.target.value)} placeholder="0" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Chi tiết thực tế</label>
            <textarea className="input-field" rows={2} value={form.actual_details}
              onChange={(e) => handleChange('actual_details', e.target.value)} />
          </div>

          <div className="form-group">
            <label className="form-label">Đánh giá tiến độ</label>
            <select className="input-field" value={form.progress_eval}
              onChange={(e) => handleChange('progress_eval', e.target.value)}>
              <option value="Hoàn thành">Hoàn thành</option>
              <option value="Đang thực hiện">Đang thực hiện</option>
              <option value="Cần hỗ trợ">Cần hỗ trợ</option>
              <option value="Trễ hạn">Trễ hạn</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Ghi chú</label>
            <textarea className="input-field" rows={2} value={form.notes}
              onChange={(e) => handleChange('notes', e.target.value)} />
          </div>

          {errorMsg && (
            <div style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.8rem' }}>
              {errorMsg}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <div className="spinner"></div> : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sub-component: Mini Progress Ring ────────────────────────────────────────
function ProgressRing({ percent, size = 48, stroke = 4, color = 'var(--accent-color)' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="var(--border-glass)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: size * 0.28, fontWeight: 700, fill: 'var(--text-primary)' }}>
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

// ─── Sub-component: Employee Detail Modal ─────────────────────────────────────
function EmployeeDetail({ employee, reports, onClose, customFieldsMap, channelLabels = {}, onEdit, onDelete }) {
  const completed = reports.filter(r => r.progress_eval === 'Hoàn thành').length;
  const inProgress = reports.filter(r => r.progress_eval === 'Đang thực hiện').length;
  const needHelp = reports.filter(r => r.progress_eval === 'Cần hỗ trợ').length;
  const totalActScreens = reports.reduce((s, r) => s + (r.actual_screens || 0), 0);
  const totalPlanScreens = reports.reduce((s, r) => s + (r.plan_screens || 0), 0);
  const totalActLocs = reports.reduce((s, r) => s + (r.actual_locations || 0), 0);
  const completionRate = totalPlanScreens > 0 ? Math.round((totalActScreens / totalPlanScreens) * 100) : 0;

  const taskBreakdown = {};
  reports.forEach(r => {
    const cat = r.task_detail || 'Khác';
    if (!taskBreakdown[cat]) taskBreakdown[cat] = { name: cat, count: 0, screens: 0 };
    taskBreakdown[cat].count++;
    taskBreakdown[cat].screens += (r.actual_screens || 0);
  });
  const pieData = Object.values(taskBreakdown);
  const pieColors = ['#d97757', '#6a9bcc', '#788c5d', '#c9a227', '#8b6fa8', '#b0aea5', '#c96f4a', '#5a86b0'];

  // ─── Gộp danh sách báo cáo: nhóm theo TUẦN, và trong mỗi tuần gộp các dòng cùng ngày +
  // cùng hạng mục công việc (VD 5-6 kênh DP LCD nộp cùng ngày, mỗi kênh 1 dòng riêng trong DB)
  // thành 1 dòng duy nhất — tránh xổ ra một "đống" task lặp lại khó nhìn.
  const [expandedMonths, setExpandedMonths] = useState({});
  const [expandedWeeks, setExpandedWeeks] = useState({});

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };
  const toggleWeek = (weekKey) => {
    setExpandedWeeks(prev => ({ ...prev, [weekKey]: !prev[weekKey] }));
  };

  const formatMonthTitle = (monthKey) => {
    if (!monthKey || monthKey === '—') return 'Khác';
    const [year, month] = monthKey.split('-');
    return `Tháng ${month}/${year}`;
  };

  const groupedGroups = useMemo(() => {
    const byMonth = {};
    reports.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const wk = r.week ?? '—';
      
      if (!byMonth[monthKey]) byMonth[monthKey] = {};
      if (!byMonth[monthKey][wk]) byMonth[monthKey][wk] = {};
      
      const key = `${r.date}|${r.task_detail}`;
      if (!byMonth[monthKey][wk][key]) {
        byMonth[monthKey][wk][key] = { date: r.date, task_detail: r.task_detail, entries: [] };
      }
      byMonth[monthKey][wk][key].entries.push(r);
    });

    return Object.entries(byMonth)
      .map(([month, weeksObj]) => {
        const weeks = Object.entries(weeksObj)
          .map(([week, groupsMap]) => {
            const rows = Object.values(groupsMap).sort((a, b) => new Date(b.date) - new Date(a.date));
            const totalInWeek = rows.reduce((acc, r) => acc + r.entries.length, 0);
            return {
              week,
              rows,
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
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [reports]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      padding: '3rem 1rem', overflowY: 'auto'
    }}>
      <div style={{ width: '100%', maxWidth: 960, animation: 'slideUp 0.3s ease' }}>

        {/* Header */}
        <div className="card-glass" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem',
          background: 'linear-gradient(135deg, rgba(217, 119, 87, 0.08) 0%, var(--bg-glass) 100%)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
              <ArrowLeft size={18} />
            </button>
            <div className="user-avatar" style={{ width: '3rem', height: '3rem', fontSize: '1.25rem' }}>
              {employee.name?.charAt(0)}
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', margin: 0 }}>{employee.name}</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{employee.role} • {reports.length} báo cáo</span>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
          <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem 0.75rem' }}>
            <ProgressRing percent={completionRate} size={56} color={completionRate >= 80 ? 'var(--success)' : completionRate >= 50 ? 'var(--accent-color)' : 'var(--danger)'} />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Tỉ lệ hoàn thành</div>
          </div>
          <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem 0.75rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
              {totalActScreens} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {employee.planScreens || 0}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Màn hình (TT/KH)</div>
          </div>
          <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem 0.75rem' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: totalActLocs >= (employee.planLocations || 0) && (employee.planLocations || 0) > 0 ? 'var(--success)' : 'var(--text-primary)' }}>
              {totalActLocs} <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {employee.planLocations || 0}</span>
              {totalActLocs >= (employee.planLocations || 0) && (employee.planLocations || 0) > 0 && ' ✓'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Địa điểm (TT/KH)</div>
          </div>
          <div className="card-glass" style={{ textAlign: 'center', padding: '1.25rem 0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>{completed}</span>
              <span style={{ color: 'var(--accent-color)', fontWeight: 700 }}>{inProgress}</span>
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{needHelp}</span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>✓ Xong / ◑ Đang / ⚠ Cần trợ</div>
          </div>
        </div>

        {/* Charts row */}
        <div className="detail-charts-grid">
          <div className="card-glass">
            <h4 className="section-title" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Phân bổ công việc</h4>
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="screens" nameKey="name" cx="50%" cy="50%"
                    outerRadius={70} innerRadius={35} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-glass)', fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card-glass">
            <h4 className="section-title" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Chi tiết loại công việc</h4>
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {pieData.map((item, i) => (
                <div key={item.name} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.5rem 0', borderBottom: '1px solid var(--border-glass)', fontSize: '0.8rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: pieColors[i % pieColors.length] }} />
                    <span>{item.name}</span>
                  </div>
                  <div style={{ color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{item.count}</strong> lần • <strong style={{ color: 'var(--text-primary)' }}>{item.screens}</strong> MH
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Detail collapsible list */}
        <div className="card-glass">
          <h4 className="section-title" style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Danh sách báo cáo chi tiết</h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {groupedGroups.map((monthGroup, monthIdx) => {
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
                    <div style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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

                            {/* Days / Rows inside Week */}
                            {isWeekOpen && (
                              <div style={{ padding: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                {weekGroup.rows.map(row => {
                                  const merged = row.entries.length > 1;
                                  const first = row.entries[0];
                                  const sumPlanLoc = row.entries.reduce((s, e) => s + (e.plan_locations || 0), 0);
                                  const sumPlanScr = row.entries.reduce((s, e) => s + (e.plan_screens || 0), 0);
                                  const hasPlan = row.entries.some(e => e.plan_locations != null || e.plan_screens != null);
                                  const anyLateReason = row.entries.some(e => hasDpReason(e.notes));
                                  const distinctDetails = [...new Set(row.entries.map(e => e.actual_details || e.plan_details).filter(Boolean))];
                                  const mergedCustomData = {};
                                  row.entries.forEach(e => {
                                    if (e.custom_data) Object.entries(e.custom_data).forEach(([k, v]) => {
                                      if (v) mergedCustomData[k] = mergedCustomData[k] ? `${mergedCustomData[k]}, ${v}` : v;
                                    });
                                  });
                                  const distinctStatuses = [...new Set(row.entries.map(e => e.progress_eval || 'Hoàn thành'))];
                                  const distinctNotes = [...new Set(row.entries.map(e => e.notes).filter(Boolean))];
                                  const detailsText = distinctDetails.join('\n');
                                  const customText = Object.keys(mergedCustomData).length > 0
                                    ? Object.entries(mergedCustomData).map(([k, v]) => `${customFieldsMap[k] || k}: ${v}`).join('\n')
                                    : '';
                                  const notesText = distinctNotes.join(' | ');

                                  const dayOfWeek = new Date(row.date + 'T00:00:00').getDay();
                                  const dayName = dayLabel(dayOfWeek);

                                  return (
                                    <div key={`${row.date}-${row.task_detail}`} className="card-glass" style={{
                                      padding: '0.85rem',
                                      borderRadius: 'var(--radius-md)',
                                      border: '1px solid var(--border-glass)',
                                      background: 'var(--bg-glass)',
                                      boxShadow: 'var(--shadow-sm)'
                                    }}>
                                      {/* Row Header: Date & Job category */}
                                      <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.4rem', marginBottom: '0.6rem'
                                      }}>
                                        <div>
                                          <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{dayName}</strong>
                                          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '0.4rem' }}>
                                            {new Date(row.date).toLocaleDateString('vi-VN')}
                                          </span>
                                        </div>
                                        <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                                          {row.task_detail}
                                        </span>
                                      </div>

                                      {/* Reports details */}
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {/* Plan and Actual splitting */}
                                        <div style={{
                                          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
                                          background: 'var(--surface-inset)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)',
                                          fontSize: '0.76rem'
                                        }}>
                                          <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem', fontSize: '0.62rem', textTransform: 'uppercase' }}>
                                              🎯 Kế hoạch
                                            </div>
                                            <div>
                                              {hasPlan ? `${sumPlanLoc || '-'} đ.điểm / ${sumPlanScr || '-'} MH` : '—'}
                                            </div>
                                          </div>
                                          <div>
                                            <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.15rem', fontSize: '0.62rem', textTransform: 'uppercase' }}>
                                              🚀 Thực tế
                                            </div>
                                            <div>
                                              {merged ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                                  {row.entries.map(e => {
                                                    const neg = (e.actual_locations || 0) < 0;
                                                    return (
                                                      <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', color: neg ? 'var(--danger)' : 'var(--text-secondary)', fontSize: '0.7rem' }}>
                                                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                          {channelLabels[e.channel] || e.channel || 'Chung'}: <strong>{e.actual_locations ?? '-'}</strong>
                                                        </span>
                                                        {onEdit && (
                                                          <button type="button" className="icon-btn" title="Sửa" onClick={() => onEdit(e)} style={{ padding: '0.1rem' }}>
                                                            <Edit size={10} />
                                                          </button>
                                                        )}
                                                        {onDelete && (
                                                          <button type="button" className="icon-btn" title="Xóa" onClick={() => onDelete(e)} style={{ padding: '0.1rem' }}>
                                                            <Trash2 size={10} />
                                                          </button>
                                                        )}
                                                      </div>
                                                    );
                                                  })}
                                                </div>
                                              ) : (
                                                <span style={{ fontWeight: 600, color: (first.actual_locations || 0) < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                                                  {first.actual_locations ?? '-'} đ.điểm / {first.actual_screens ?? '-'} MH
                                                  {(first.actual_locations || 0) < 0 && ' ⚠'}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Status & Details */}
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                          <strong style={{ color: 'var(--text-muted)' }}>Chi tiết: </strong>
                                          <span style={{ whiteSpace: 'pre-line' }}>{detailsText || '-'}</span>
                                        </div>

                                        {/* Custom Data */}
                                        {customText && (
                                          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', borderLeft: '2px solid var(--accent-color)', paddingLeft: '0.4rem' }}>
                                            <span style={{ whiteSpace: 'pre-line' }}>{customText}</span>
                                          </div>
                                        )}

                                        {/* Notes & Reason */}
                                        {notesText && (
                                          <div style={{
                                            fontSize: '0.74rem', color: 'var(--text-secondary)',
                                            background: anyLateReason ? 'var(--danger-bg)' : 'var(--surface-inset)',
                                            padding: '0.3rem 0.5rem', borderRadius: 'var(--radius-sm)'
                                          }}>
                                            {anyLateReason && (
                                              <span className="badge badge-danger" style={{ marginRight: '0.3rem', fontSize: '0.65rem' }}>
                                                <AlertTriangle size={10} style={{ verticalAlign: 'middle', marginRight: '0.15rem' }} /> Trễ hạn
                                              </span>
                                            )}
                                            <strong>Ghi chú:</strong> {notesText}
                                          </div>
                                        )}

                                        {/* Actions for non-merged */}
                                        {!merged && (onEdit || onDelete) && (
                                          <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', marginTop: '0.15rem' }}>
                                            {onEdit && (
                                              <button type="button" className="btn btn-secondary" onClick={() => onEdit(first)}
                                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', height: '24px' }} title="Sửa">
                                                <Edit size={11} /> Sửa
                                              </button>
                                            )}
                                            {onDelete && (
                                              <button type="button" className="btn btn-danger" onClick={() => onDelete(first)}
                                                style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', height: '24px' }} title="Xóa">
                                                <Trash2 size={11} /> Xóa
                                              </button>
                                            )}
                                          </div>
                                        )}

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
        </div>
      </div>
    </div>
  );
}

// ─── Main Leader Dashboard ────────────────────────────────────────────────────
export default function LeaderDashboard() {
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('team'); // 'team' | 'table'

  // Date range state
  const [dateStart, setDateStart] = useState(null);
  const [dateEnd, setDateEnd] = useState(null);
  const [activeTimePreset, setActiveTimePreset] = useState('all');

  // Filters
  const [searchEmployee, setSearchEmployee] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('All');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  // Chỉ hiện báo cáo DP LCD có "lý do chưa hoàn thành đúng hạn" — giúp admin không phải đọc từng ghi chú
  const [onlyLateReason, setOnlyLateReason] = useState(false);

  // Employee detail modal
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  // Báo cáo đang sửa (admin) — null = không mở modal sửa
  const [editingReport, setEditingReport] = useState(null);

  // Bộ lọc phụ (tìm kiếm/tuần/loại việc/trạng thái) — thu gọn mặc định cho đỡ rối
  const [showFilters, setShowFilters] = useState(false);

  // Chart data
  const [taskChartData, setTaskChartData] = useState([]);

  // Available Filter Options
  const [weeksList, setWeeksList] = useState([]);
  const [categoriesList, setCategoriesList] = useState([]);
  const [customFieldsMap, setCustomFieldsMap] = useState({});
  const [channelLabels, setChannelLabels] = useState({});
  const [sysCategories, setSysCategories] = useState([]);
  const [assignments, setAssignments] = useState([]);

  const dpCategory = useMemo(() => findDpCategory(sysCategories), [sysCategories]);

  useEffect(() => {
    fetchReports();
    const initSettings = async () => {
      const res = await db.settings.get();
      if(res.data) {
        const map = {};
        res.data.fields?.filter(f => f.isCustom).forEach(f => map[f.id] = f.label);
        setCustomFieldsMap(map);
        setChannelLabels(buildChannelLabels(res.data.channels));
        setSysCategories(res.data.categories || []);
      }
      try {
        const asgRes = await db.assignments.getAll();
        setAssignments(asgRes?.data || []);
      } catch (err) {
        console.error("Error fetching assignments:", err);
      }
    };
    initSettings();
  }, [dateStart, dateEnd]);
  useEffect(() => { applyFilters(); }, [reports, searchEmployee, selectedWeek, selectedCategory, selectedStatus, onlyLateReason]);

  // Modal chi tiết nhân viên giữ 1 bản snapshot reports riêng — mỗi khi `reports` được tải lại
  // (sau khi admin sửa/xóa 1 báo cáo), đồng bộ lại snapshot đó để modal không hiển thị dữ liệu cũ.
  useEffect(() => {
    if (!selectedEmployee) return;
    setSelectedEmployee(prev => prev ? { ...prev, reports: reports.filter(r => r.user_id === prev.userId) } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reports]);

  const handleDeleteReport = async (report) => {
    if (!window.confirm(`Xóa báo cáo "${report.task_detail}" ngày ${new Date(report.date).toLocaleDateString('vi-VN')} của ${report.employee_name}? Không thể hoàn tác.`)) return;
    try {
      const { error } = await db.reports.delete(report.id);
      if (error) throw error;
      fetchReports();
    } catch (err) {
      console.error(err);
      alert('Không thể xóa báo cáo, vui lòng thử lại!');
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      console.log("LeaderDashboard: Fetching reports for range:", dateStart, "to", dateEnd);
      const { data, error } = await db.reports.getAll(dateStart, dateEnd);
      if (error) throw error;
      const loadedReports = data || [];
      console.log("LeaderDashboard: Fetched reports count:", loadedReports.length, loadedReports);
      setReports(loadedReports);
      const weeks = [...new Set(loadedReports.map(r => r.week))].sort((a, b) => b - a);
      const categories = [...new Set(loadedReports.map(r => r.task_detail))].filter(Boolean);
      setWeeksList(weeks);
      setCategoriesList(categories);
    } catch (err) {
      console.error("LeaderDashboard: Error loading all reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleTimeRangeChange = useCallback((start, end, presetKey) => {
    setDateStart(start);
    setDateEnd(end);
    setActiveTimePreset(presetKey);
    // Reset other filters when time range changes
    setSelectedWeek('All');
  }, []);

  const applyFilters = () => {
    let result = [...reports];
    console.log("LeaderDashboard: Applying filters on reports:", reports.length);
    if (searchEmployee.trim()) {
      const term = searchEmployee.toLowerCase();
      result = result.filter(r => r.employee_name?.toLowerCase().includes(term));
    }
    if (selectedWeek !== 'All') result = result.filter(r => r.week === parseInt(selectedWeek));
    if (selectedCategory !== 'All') result = result.filter(r => r.task_detail === selectedCategory);
    if (selectedStatus !== 'All') result = result.filter(r => r.progress_eval === selectedStatus);
    if (onlyLateReason) result = result.filter(r => hasDpReason(r.notes));
    console.log("LeaderDashboard: Filtered reports count:", result.length, result);
    setFilteredReports(result);
    generateChartData(result);
  };

  const generateChartData = (data) => {
    const taskMap = {};
    data.forEach(r => {
      const cat = r.task_detail || 'Khác';
      if (!taskMap[cat]) taskMap[cat] = { name: cat, 'Kế hoạch': 0, 'Thực tế': 0 };
      taskMap[cat]['Kế hoạch'] += (r.plan_screens || 0) + (r.plan_locations || 0);
      taskMap[cat]['Thực tế'] += (r.actual_screens || 0) + (r.actual_locations || 0);
    });

    const dpKey = Object.keys(taskMap).find(k => isDpCategory(k, dpCategory));
    if (dpKey) {
      const userIds = [...new Set(data.map(r => r.user_id))];
      const dpAsgs = assignments.filter(a => userIds.includes(a.user_id) && isDpCategory(a.category, dpCategory));
      const targetLocations = dpAsgs.reduce((s, a) => s + (a.locations || 0), 0);
      taskMap[dpKey]['Kế hoạch'] = targetLocations;
    }

    setTaskChartData(Object.values(taskMap));
  };

  // ── Employee aggregation for team view ──────────────────────────────────────
  const employeeStats = useMemo(() => {
    const map = {};
    filteredReports.forEach(r => {
      const key = r.user_id || 'Nhân viên';
      if (!map[key]) {
        map[key] = {
          name: r.employee_name || 'Nhân viên',
          role: r.role_name || 'Kỹ thuật viên',
          userId: r.user_id,
          totalReports: 0,
          completed: 0,
          inProgress: 0,
          needHelp: 0,
          planScreens: 0,
          actualScreens: 0,
          planLocations: 0,
          actualLocations: 0,
          tasks: new Set()
        };
      }
      const e = map[key];
      e.totalReports++;
      if (r.progress_eval === 'Hoàn thành') e.completed++;
      else if (r.progress_eval === 'Đang thực hiện') e.inProgress++;
      else if (r.progress_eval === 'Cần hỗ trợ') e.needHelp++;
      e.planScreens += (r.plan_screens || 0);
      e.actualScreens += (r.actual_screens || 0);
      e.planLocations += (r.plan_locations || 0);
      e.actualLocations += (r.actual_locations || 0);
      if (r.task_detail) e.tasks.add(r.task_detail);
    });

    return Object.values(map).map(e => {
      const empAsgs = assignments.filter(a => a.user_id === e.userId && isDpCategory(a.category, dpCategory));
      const dpPlanLocs = empAsgs.reduce((s, a) => s + (a.locations || 0), 0);
      
      const totalPlanLocs = e.planLocations + dpPlanLocs;
      const totalPlan = totalPlanLocs + e.planScreens;
      const totalActual = e.actualLocations + e.actualScreens;
      
      const completionRate = totalPlan > 0 
        ? Math.min(100, Math.round((totalActual / totalPlan) * 100))
        : (e.totalReports > 0 ? 100 : 0);

      return {
        ...e,
        planLocations: totalPlanLocs,
        tasks: [...e.tasks],
        completionRate
      };
    }).sort((a, b) => (b.actualScreens + b.actualLocations) - (a.actualScreens + a.planLocations));
  }, [filteredReports, assignments, dpCategory]);

  // ── Export to Excel (Beautiful & Structured layout) ────────────────────────
  const handleExportExcel = () => {
    if (filteredReports.length === 0) { alert('Không có dữ liệu báo cáo để xuất!'); return; }
    
    const todayStr = toLocalIsoDate();
    const dateRangeStr = dateStart && dateEnd 
      ? `Từ ngày ${new Date(dateStart).toLocaleDateString('vi-VN')} đến ngày ${new Date(dateEnd).toLocaleDateString('vi-VN')}`
      : 'Tất cả thời gian';
      
    const headerAOA = [
      ['BÁO CÁO TỔNG HỢP TIẾN ĐỘ CÔNG VIỆC KỸ THUẬT - GOLDEN ASIA'],
      [`Thời gian xuất: ${new Date().toLocaleString('vi-VN')}`],
      [`Khoảng lọc: ${dateRangeStr}`],
      [], 
      [
        'STT', 'Tuần', 'Ngày', 'Họ tên nhân viên', 'Chức vụ', 'Hạng mục công việc',
        'Kế hoạch - Địa điểm', 'Kế hoạch - Màn hình', 'Kế hoạch - Chi tiết',
        'Thực tế - Địa điểm', 'Thực tế - Màn hình', 'Thực tế - Chi tiết',
        'Đánh giá tiến độ', 'Ghi chú'
      ]
    ];
    
    // Sắp xếp báo cáo khoa học trước khi xuất
    const sortedReports = [...filteredReports].sort((a, b) => {
      const weekDiff = (b.week || 0) - (a.week || 0);
      if (weekDiff !== 0) return weekDiff;
      const dateDiff = new Date(a.date) - new Date(b.date);
      if (dateDiff !== 0) return dateDiff;
      return (a.employee_name || '').localeCompare(b.employee_name || '');
    });
    
    const rows = sortedReports.map((r, index) => {
      let planLoc = r.plan_locations;
      let planScr = r.plan_screens;
      
      if (isDpCategory(r.task_detail, dpCategory) && r.plan_locations === null) {
        const matchAsg = assignments.find(a => a.user_id === r.user_id && isDpCategory(a.category, dpCategory) && (a.channel || 'ALL') === r.channel);
        planLoc = matchAsg?.locations ?? 0;
        planScr = matchAsg?.screens ?? 0;
      }
      
      return [
        index + 1,
        r.week,
        new Date(r.date).toLocaleDateString('vi-VN'),
        r.employee_name,
        r.role_name || 'Kỹ thuật viên',
        r.task_detail + (r.channel ? ` (${r.channel})` : ''),
        planLoc ?? 0,
        planScr ?? 0,
        r.plan_details || '',
        r.actual_locations ?? 0,
        r.actual_screens ?? 0,
        r.actual_details || '',
        r.progress_eval || 'Hoàn thành',
        r.notes || ''
      ];
    });
    
    const sumPlanLoc = rows.reduce((s, r) => s + Number(r[6] || 0), 0);
    const sumPlanScr = rows.reduce((s, r) => s + Number(r[7] || 0), 0);
    const sumActLoc = rows.reduce((s, r) => s + Number(r[9] || 0), 0);
    const sumActScr = rows.reduce((s, r) => s + Number(r[10] || 0), 0);
    
    const totalsRow = [
      'TỔNG CỘNG', '', '', '', '', '',
      sumPlanLoc, sumPlanScr, '',
      sumActLoc, sumActScr, '',
      '', ''
    ];
    
    const fullData = [...headerAOA, ...rows, totalsRow];
    const worksheet = XLSX.utils.aoa_to_sheet(fullData);
    
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 13 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 13 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 13 } },
      { s: { r: headerAOA.length + rows.length, c: 0 }, e: { r: headerAOA.length + rows.length, c: 5 } }
    ];
    
    // Căn giãn độ rộng các cột tối ưu nhất, tăng độ rộng các cột mô tả công việc
    worksheet['!cols'] = [
      { wch: 6 },  // STT
      { wch: 8 },  // Tuần
      { wch: 13 }, // Ngày
      { wch: 24 }, // Họ tên nhân viên
      { wch: 18 }, // Chức vụ
      { wch: 28 }, // Hạng mục công việc
      { wch: 20 }, // KH Địa điểm
      { wch: 20 }, // KH Màn hình
      { wch: 35 }, // KH Chi tiết
      { wch: 20 }, // TT Địa điểm
      { wch: 20 }, // TT Màn hình
      { wch: 35 }, // TT Chi tiết
      { wch: 18 }, // Đánh giá tiến độ
      { wch: 28 }  // Ghi chú
    ];
    
    // Thiết lập chiều cao hàng (Row Heights) tạo độ rộng rãi, thoáng mắt khi đọc trên Excel
    worksheet['!rows'] = [
      { hpt: 28 }, // Tiêu đề chính
      { hpt: 16 }, // Thời gian xuất
      { hpt: 16 }, // Khoảng lọc
      { hpt: 8 },  // Hàng đệm trống
      { hpt: 24 }, // Header bảng
      ...rows.map(() => ({ hpt: 20 })), // Chiều cao mỗi dòng dữ liệu
      { hpt: 22 }  // Chiều cao dòng Tổng cộng
    ];
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Báo Cáo Tổng Hợp");
    
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
          td:nth-child(1), td:nth-child(2), td:nth-child(3), td:nth-child(13) { text-align: center; }
          td:nth-child(7), td:nth-child(8), td:nth-child(10), td:nth-child(11) { text-align: right; }
          
          /* Tiêu đề chính */
          tr:nth-child(1) td { font-size: 14pt; font-weight: bold; color: #222222; text-align: center; border: none; height: 35px; }
          tr:nth-child(2) td, tr:nth-child(3) td { font-size: 9pt; color: #666666; text-align: center; border: none; }
          tr:nth-child(4) td { border: none; height: 8px; }
          
          /* Bôi màu Header bảng (Màu cam Golden Asia sang trọng) */
          tr:nth-child(5) td { background-color: #d97757; color: white; font-weight: bold; text-align: center; height: 26px; }
          
          /* Bôi màu hàng tổng cộng cuối cùng */
          tr:last-child td { background-color: #f9f9f9; font-weight: bold; border-top: 1.5pt solid #999999; }
        </style>
      </head>`
    );

    const blob = new Blob([styledHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BAO_CAO_TONG_HOP_LEADER_${todayStr}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // ── Calculated Stats ────────────────────────────────────────────────────────
  const totalScreens = filteredReports.reduce((s, r) => s + (r.actual_screens || 0), 0);
  const totalLocations = filteredReports.reduce((s, r) => s + (r.actual_locations || 0), 0);
  const totalMembers = [...new Set(filteredReports.map(r => r.user_id))].length;
  
  const activeUserIds = [...new Set(filteredReports.map(r => r.user_id))];
  const activeAssignments = assignments.filter(a => activeUserIds.includes(a.user_id) && isDpCategory(a.category, dpCategory));
  const dpPlanLocsTotal = activeAssignments.reduce((s, a) => s + (a.locations || 0), 0);
  const planLocationsTotal = filteredReports.reduce((s, r) => s + (r.plan_locations || 0), 0) + dpPlanLocsTotal;
  const planScreensTotal = filteredReports.reduce((s, r) => s + (r.plan_screens || 0), 0);
  const totalPlanSum = planLocationsTotal + planScreensTotal;
  const totalActualSum = totalLocations + totalScreens;

  const overallCompletion = totalPlanSum > 0 ? Math.min(100, Math.round((totalActualSum / totalPlanSum) * 100)) : 0;
  const completedCount = filteredReports.filter(r => r.progress_eval === 'Hoàn thành').length;
  const issueCount = filteredReports.filter(r => r.progress_eval === 'Cần hỗ trợ' || r.progress_eval === 'Trễ hạn').length;

  // ── Đếm số bộ lọc phụ đang áp dụng + hàm xóa nhanh ──────────────────────────
  const activeFilterCount = [
    searchEmployee.trim() !== '',
    selectedWeek !== 'All',
    selectedCategory !== 'All',
    selectedStatus !== 'All',
    onlyLateReason
  ].filter(Boolean).length;

  const resetFilters = () => {
    setSearchEmployee('');
    setSelectedWeek('All');
    setSelectedCategory('All');
    setSelectedStatus('All');
    setOnlyLateReason(false);
  };

  const lateReasonCount = reports.filter(r => hasDpReason(r.notes)).length;

  const openEmployeeDetail = (userId) => {
    const empReports = filteredReports.filter(r => r.user_id === userId);
    const emp = employeeStats.find(e => e.userId === userId);
    if (!emp) return;
    setSelectedEmployee({ ...emp, reports: empReports });
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="container" style={{ paddingBottom: '3rem' }}>

      {/* ── Time Range Filter & Indicator ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
        <div style={{ flex: 1, minWidth: '280px' }}>
          <TimeRangeFilter onRangeChange={handleTimeRangeChange} initialPreset="all" />
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
          padding: '0.3rem 0.75rem', borderRadius: 'var(--radius-full)',
          background: isSupabaseConfigured ? 'var(--success-bg)' : 'var(--warning-bg)',
          border: `1px solid ${isSupabaseConfigured ? 'rgba(120, 140, 93, 0.35)' : 'rgba(184, 134, 11, 0.35)'}`,
          fontSize: '0.7rem', color: isSupabaseConfigured ? 'var(--success)' : 'var(--accent-color)'
        }}>
          <Database size={12} />
          <span>{isSupabaseConfigured ? 'Supabase Cloud' : 'Demo (Local Storage)'}</span>
        </div>
      </div>

      {/* ── Sleek Overview Panel ── */}
      <div className="card-glass" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '1.25rem',
        marginTop: '1.25rem',
        padding: '1rem 1.25rem',
        alignItems: 'center'
      }}>
        {/* Overall Progress Ring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <ProgressRing percent={overallCompletion} size={56} color={overallCompletion >= 80 ? 'var(--success)' : overallCompletion >= 50 ? 'var(--accent-color)' : 'var(--danger)'} />
          <div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tiến độ tổng</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {totalScreens} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>/ {planScreensTotal} MH</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(70px, 1fr))',
          gap: '1rem',
          width: '100%'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
              📍 {totalLocations}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Địa điểm</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--info)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
              👥 {totalMembers}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Thành viên</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
              ✓ {completedCount}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Xong</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: issueCount > 0 ? 'var(--danger)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.2rem' }}>
              ⚠️ {issueCount}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>Trễ / Cần trợ</div>
          </div>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        marginTop: '1.25rem',
        marginBottom: '1rem'
      }}>
        {/* View Mode Segmented Control */}
        <div style={{
          display: 'inline-flex',
          background: 'var(--surface-inset)',
          padding: '2px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-glass)'
        }}>
          <button
            onClick={() => setViewMode('team')}
            className={`btn ${viewMode === 'team' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              borderRadius: 'calc(var(--radius-md) - 2px)',
              padding: '0.35rem 0.85rem',
              fontSize: '0.78rem',
              border: 'none',
              boxShadow: viewMode === 'team' ? 'var(--shadow-sm)' : 'none',
              background: viewMode === 'team' ? 'var(--accent-color)' : 'transparent',
              color: viewMode === 'team' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <Users size={13} style={{ marginRight: '0.25rem' }} /> Nhân viên
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`btn ${viewMode === 'table' ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              borderRadius: 'calc(var(--radius-md) - 2px)',
              padding: '0.35rem 0.85rem',
              fontSize: '0.78rem',
              border: 'none',
              boxShadow: viewMode === 'table' ? 'var(--shadow-sm)' : 'none',
              background: viewMode === 'table' ? 'var(--accent-color)' : 'transparent',
              color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)'
            }}
          >
            <ListFilter size={13} style={{ marginRight: '0.25rem' }} /> Bảng tổng hợp
          </button>
        </div>

        {/* Filter Trigger & Reset */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowFilters(v => !v)}
            className="btn btn-secondary"
            style={{
              padding: '0.4rem 0.85rem',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <ListFilter size={13} />
            Bộ lọc
            {activeFilterCount > 0 && (
              <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.05rem 0.3rem' }}>{activeFilterCount}</span>
            )}
            {showFilters ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="btn btn-secondary"
              style={{
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <X size={12} /> Xóa lọc
            </button>
          )}
        </div>
      </div>

      {/* ── Additional Filters (thu gọn mặc định) ── */}
      {showFilters && (
      <div className="filters-bar" style={{ marginTop: '0.75rem' }}>
        <div className="filter-item" style={{ flex: '1.5' }}>
          <label className="form-label">Tìm nhân viên</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '11px', color: 'var(--text-muted)' }} />
            <input type="text" className="input-field w-full" placeholder="Nhập tên..."
              value={searchEmployee} onChange={(e) => setSearchEmployee(e.target.value)}
              style={{ paddingLeft: '2.25rem', paddingTop: '0.5rem', paddingBottom: '0.5rem' }} />
          </div>
        </div>
        <div className="filter-item">
          <label className="form-label">Tuần</label>
          <select className="input-field" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)}
            style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
            <option value="All">Tất cả</option>
            {weeksList.map(w => <option key={w} value={w}>Tuần {w}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label className="form-label">Công việc</label>
          <select className="input-field" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}
            style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
            <option value="All">Tất cả</option>
            {categoriesList.map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div className="filter-item">
          <label className="form-label">Trạng thái</label>
          <select className="input-field" value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value)}
            style={{ paddingTop: '0.5rem', paddingBottom: '0.5rem' }}>
            <option value="All">Tất cả</option>
            <option value="Hoàn thành">Hoàn thành</option>
            <option value="Đang thực hiện">Đang thực hiện</option>
            <option value="Cần hỗ trợ">Cần hỗ trợ</option>
            <option value="Trễ hạn">Trễ hạn</option>
          </select>
        </div>
        <div className="filter-item" style={{ justifyContent: 'flex-end' }}>
          <label className="form-label" style={{ visibility: 'hidden' }}>.</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: 'var(--text-secondary)', height: '38px', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={onlyLateReason} onChange={(e) => setOnlyLateReason(e.target.checked)} />
            <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />
            Chỉ có lý do trễ hạn{lateReasonCount > 0 ? ` (${lateReasonCount})` : ''}
          </label>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={fetchReports} title="Làm mới"
            style={{ height: '38px', width: '38px', padding: 0 }}><RefreshCw size={16} /></button>
          <button className="btn btn-primary" onClick={handleExportExcel}
            style={{ height: '38px', padding: '0 1rem' }}><Download size={16} /> Xuất Excel</button>
        </div>
      </div>
      )}



      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
          <div className="spinner" style={{ width: '3rem', height: '3rem', color: 'var(--accent-color)' }}></div>
        </div>
      ) : viewMode === 'team' ? (
        <>
          {/* ── Team View: Employee Cards Grid ── */}
          {employeeStats.length === 0 ? (
            <div className="card-glass" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              Không có dữ liệu trong khoảng thời gian đã chọn.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1rem' }}>
              {employeeStats.map(emp => {
                const ringColor = emp.completionRate >= 80 ? 'var(--success)' : emp.completionRate >= 50 ? 'var(--accent-color)' : 'var(--danger)';
                return (
                  <div key={emp.userId || emp.name} className="card-glass" style={{
                    cursor: 'pointer', transition: 'all 0.3s ease', borderLeft: `3px solid ${ringColor}`,
                    display: 'flex', flexDirection: 'column', gap: '0.75rem'
                  }}
                    onClick={() => openEmployeeDetail(emp.userId)}
                  >
                    {/* Card Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div className="user-avatar" style={{ width: '2.5rem', height: '2.5rem', fontSize: '1rem' }}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{emp.name}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emp.role}</div>
                        </div>
                      </div>
                      <ProgressRing percent={emp.completionRate} size={44} stroke={3} color={ringColor} />
                    </div>

                    {/* Sleek inline metrics */}
                    <div style={{ display: 'flex', gap: '0.85rem', fontSize: '0.76rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-glass)', paddingTop: '0.5rem' }}>
                      <div>🖥️ <strong>{emp.actualScreens}</strong> MH</div>
                      <div>📍 <strong>{emp.actualLocations}/{emp.planLocations || 0}</strong> đ.điểm</div>
                      <div>📝 <strong>{emp.totalReports}</strong> báo cáo</div>
                    </div>

                    {/* Status badges & tasks */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {emp.completed > 0 && <span className="badge badge-success" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>✓ {emp.completed}</span>}
                        {emp.inProgress > 0 && <span className="badge badge-info" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>◑ {emp.inProgress}</span>}
                        {emp.needHelp > 0 && <span className="badge badge-danger" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>⚠ {emp.needHelp}</span>}
                      </div>
                      {emp.tasks.length > 0 && (
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          {emp.tasks.slice(0, 2).join(', ')}{emp.tasks.length > 2 ? '...' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Charts below team cards ── */}
          {filteredReports.length > 0 && (
            <div className="card-glass" style={{ marginTop: '1.5rem' }}>
              <h3 className="section-title mb-2">Biểu đồ so sánh Kế hoạch vs Thực tế theo Loại công việc</h3>
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskChartData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-glass)" />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={10} tickLine={false} />
                    <YAxis stroke="var(--text-secondary)" fontSize={10} tickLine={false} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-glass)' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Kế hoạch" fill="var(--text-muted)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Thực tế" fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Table View ── */
        <div className="card-glass">
          <div className="flex-between">
            <h3 className="section-title">Bảng Tổng Hợp Báo Cáo</h3>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{filteredReports.length} dòng</span>
          </div>
          {filteredReports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Không có dữ liệu khớp bộ lọc.</div>
          ) : (
            <div className="table-wrapper">
              <table className="report-table history-table">
                <thead>
                  <tr>
                    <th>Nhân viên</th>
                    <th>Ngày</th>
                    <th>Công việc</th>
                    <th>KH (Đ.điểm / MH)</th>
                    <th>TT (Đ.điểm / MH)</th>
                    <th>Chi tiết</th>
                    <th>Dữ liệu bổ sung</th>
                    <th>Trạng thái</th>
                    <th>Ghi chú</th>
                    <th style={{ textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {groupReportRows(filteredReports).map(row => {
                    const merged = row.entries.length > 1;
                    const first = row.entries[0];
                    const sumPlanLoc = row.entries.reduce((s, e) => s + (e.plan_locations || 0), 0);
                    const sumPlanScr = row.entries.reduce((s, e) => s + (e.plan_screens || 0), 0);
                    const hasPlan = row.entries.some(e => e.plan_locations != null || e.plan_screens != null);
                    const anyLateReason = row.entries.some(e => hasDpReason(e.notes));
                    const distinctDetails = [...new Set(row.entries.map(e => e.actual_details || e.plan_details).filter(Boolean))];
                    const mergedCustomData = {};
                    row.entries.forEach(e => {
                      if (e.custom_data) Object.entries(e.custom_data).forEach(([k, v]) => {
                        if (v) mergedCustomData[k] = mergedCustomData[k] ? `${mergedCustomData[k]}, ${v}` : v;
                      });
                    });
                    const distinctStatuses = [...new Set(row.entries.map(e => e.progress_eval || 'Hoàn thành'))];
                    const distinctNotes = [...new Set(row.entries.map(e => e.notes).filter(Boolean))];
                    const detailsText = distinctDetails.join('\n');
                    const customText = Object.keys(mergedCustomData).length > 0
                      ? Object.entries(mergedCustomData).map(([k, v]) => `${customFieldsMap[k] || k}: ${v}`).join('\n')
                      : '';
                    const notesText = distinctNotes.join(' | ');
                    return (
                    <tr key={row.key} style={{ cursor: 'pointer' }} onClick={() => openEmployeeDetail(row.entries?.[0]?.user_id)}>
                      <td data-label="Nhân viên">
                        <div style={{ fontWeight: 700 }}>{row.employee_name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{row.role_name}</div>
                      </td>
                      <td data-label="Ngày" style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600 }}>{new Date(row.date).toLocaleDateString('vi-VN')}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>T{row.week}</div>
                      </td>
                      <td data-label="Công việc">
                        <span className="badge badge-info">{row.task_detail}</span>
                        {merged && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                            {row.entries.length} kênh
                          </div>
                        )}
                      </td>
                      <td data-label="KH (Đ.điểm / MH)" style={{ fontSize: '0.8rem' }}>{hasPlan ? `${sumPlanLoc || '-'} / ${sumPlanScr || '-'}` : '-'}</td>
                      <td data-label="TT (Đ.điểm / MH)" style={{ fontSize: '0.8rem' }}>
                        {merged ? (
                          <div className="detail-channel-grid">
                            {row.entries.map(e => {
                              const neg = (e.actual_locations || 0) < 0;
                              return (
                                <span key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: neg ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                  <span style={{ flex: 1 }}>
                                    {channelLabels[e.channel] || e.channel || 'Chung'}: <strong style={{ color: neg ? 'var(--danger)' : 'var(--text-primary)' }}>{e.actual_locations ?? '-'}</strong>
                                    {neg && ' ⚠'}
                                  </span>
                                  <button type="button" className="icon-btn" title="Sửa"
                                    onClick={(ev) => { ev.stopPropagation(); setEditingReport(e); }} style={{ padding: '0.15rem' }}>
                                    <Edit size={11} />
                                  </button>
                                  <button type="button" className="icon-btn" title="Xóa"
                                    onClick={(ev) => { ev.stopPropagation(); handleDeleteReport(e); }} style={{ padding: '0.15rem' }}>
                                    <Trash2 size={11} />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontWeight: 600, color: (first.actual_locations || 0) < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                            {first.actual_locations ?? '-'} / {first.actual_screens ?? '-'}
                            {(first.actual_locations || 0) < 0 && ' ⚠'}
                          </span>
                        )}
                      </td>
                      <td data-label="Chi tiết" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 180 }} title={detailsText || undefined}>
                        <div className="detail-clamp-text">{detailsText || '-'}</div>
                      </td>
                      <td data-label="Dữ liệu bổ sung" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 150 }} title={customText || undefined}>
                        <div className="detail-clamp-text">{customText || '-'}</div>
                      </td>
                      <td data-label="Trạng thái">
                        {distinctStatuses.map(s => (
                          <span key={s} className={`badge ${s === 'Hoàn thành' ? 'badge-success' : s === 'Cần hỗ trợ' ? 'badge-danger' : s === 'Đang thực hiện' ? 'badge-info' : 'badge-warning'}`} style={{ marginRight: '0.25rem' }}>
                            {s}
                          </span>
                        ))}
                      </td>
                      <td data-label="Ghi chú" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: 120 }} title={notesText || undefined}>
                      {anyLateReason && (
                        <span className="badge badge-danger" style={{ marginRight: '0.3rem', fontSize: '0.65rem' }} title="Có lý do chưa hoàn thành đúng hạn">
                          <AlertTriangle size={10} />
                        </span>
                      )}
                      <div className="detail-clamp-text">{notesText || '-'}</div>
                    </td>
                      <td data-label="Thao tác" style={{ verticalAlign: 'middle' }} onClick={(ev) => ev.stopPropagation()}>
                        {merged ? (
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Sửa/xóa theo từng kênh ở cột TT</span>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setEditingReport(first)}
                              style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)' }} title="Sửa">
                              <Edit size={13} />
                            </button>
                            <button type="button" className="btn btn-danger" onClick={() => handleDeleteReport(first)}
                              style={{ padding: '0.375rem', borderRadius: 'var(--radius-sm)' }} title="Xóa">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Employee Detail Modal ── */}
      {selectedEmployee && (
        <EmployeeDetail
          employee={selectedEmployee}
          reports={selectedEmployee.reports}
          customFieldsMap={customFieldsMap}
          channelLabels={channelLabels}
          onClose={() => setSelectedEmployee(null)}
          onEdit={(report) => setEditingReport(report)}
          onDelete={handleDeleteReport}
        />
      )}

      {/* ── Admin Edit Report Modal ── */}
      {editingReport && (
        <AdminEditReportModal
          report={editingReport}
          channelLabels={channelLabels}
          onClose={() => setEditingReport(null)}
          onSaved={() => { setEditingReport(null); fetchReports(); }}
        />
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
// v1.1 — gộp thống kê nhân viên theo user_id thay vì theo tên
