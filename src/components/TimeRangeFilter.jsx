import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock, Zap } from 'lucide-react';
import { toLocalIsoDate } from '../channels';

const PRESETS = [
  { key: 'today', label: 'Hôm nay', icon: '📅' },
  { key: '7days', label: '7 ngày', icon: '📆' },
  { key: 'thisWeek', label: 'Tuần này', icon: '🗓️' },
  { key: 'thisMonth', label: 'Tháng này', icon: '📊' },
  { key: 'thisQuarter', label: 'Quý này', icon: '📈' },
  { key: 'thisYear', label: 'Năm nay', icon: '🗃️' },
  { key: 'all', label: 'Tất cả', icon: '♾️' },
];

function getDateRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case '7days': {
      const start = new Date(today);
      start.setDate(start.getDate() - 6);
      return { start, end: today };
    }
    case 'thisWeek': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday = start
      const start = new Date(today);
      start.setDate(start.getDate() - diff);
      return { start, end: today };
    }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start, end: today };
    }
    case 'thisQuarter': {
      const qMonth = Math.floor(today.getMonth() / 3) * 3;
      const start = new Date(today.getFullYear(), qMonth, 1);
      return { start, end: today };
    }
    case 'thisYear': {
      const start = new Date(today.getFullYear(), 0, 1);
      return { start, end: today };
    }
    case 'all':
    default:
      return { start: null, end: null };
  }
}

function formatDate(d) {
  if (!d) return '';
  // Dùng giờ địa phương thay vì toISOString() (quy đổi UTC) — tránh lệch 1 ngày ở múi giờ dương
  // như Việt Nam (UTC+7) khi "today" được dựng từ giờ địa phương lúc nửa đêm.
  return toLocalIsoDate(d);
}

function formatDisplayDate(d) {
  if (!d) return 'Tất cả';
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function TimeRangeFilter({ onRangeChange, initialPreset = 'all' }) {
  const [activePreset, setActivePreset] = useState(initialPreset);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const currentRange = useMemo(() => {
    if (activePreset === 'custom') {
      return {
        start: customStart ? new Date(customStart) : null,
        end: customEnd ? new Date(customEnd) : null
      };
    }
    return getDateRange(activePreset);
  }, [activePreset, customStart, customEnd]);

  const handlePresetClick = (key) => {
    setActivePreset(key);
    setShowCustom(false);
    const range = getDateRange(key);
    onRangeChange?.(formatDate(range.start), formatDate(range.end), key);
  };

  const handleCustomApply = () => {
    setActivePreset('custom');
    onRangeChange?.(customStart || null, customEnd || null, 'custom');
  };

  // Navigate month prev/next
  const navigateMonth = (direction) => {
    const ref = currentRange.start || new Date();
    const newStart = new Date(ref.getFullYear(), ref.getMonth() + direction, 1);
    const newEnd = new Date(newStart.getFullYear(), newStart.getMonth() + 1, 0);
    const today = new Date();
    const finalEnd = newEnd > today ? today : newEnd;

    setActivePreset('custom');
    setCustomStart(formatDate(newStart));
    setCustomEnd(formatDate(finalEnd));
    onRangeChange?.(formatDate(newStart), formatDate(finalEnd), 'custom');
  };

  const displayLabel = useMemo(() => {
    if (activePreset === 'all') return 'Hiển thị tất cả thời gian';
    if (activePreset === 'custom') {
      return `${formatDisplayDate(customStart ? new Date(customStart) : null)} → ${formatDisplayDate(customEnd ? new Date(customEnd) : null)}`;
    }
    const preset = PRESETS.find(p => p.key === activePreset);
    const range = getDateRange(activePreset);
    return `${preset?.label}: ${formatDisplayDate(range.start)} → ${formatDisplayDate(range.end)}`;
  }, [activePreset, customStart, customEnd]);

  return (
    <div className="time-range-filter">
      {/* Preset buttons */}
      <div className="time-range-presets">
        {PRESETS.map(p => (
          <button
            key={p.key}
            className={`time-range-btn ${activePreset === p.key ? 'active' : ''}`}
            onClick={() => handlePresetClick(p.key)}
          >
            <span className="time-range-btn-icon">{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
        <button
          className={`time-range-btn ${showCustom || activePreset === 'custom' ? 'active' : ''}`}
          onClick={() => setShowCustom(!showCustom)}
        >
          <Calendar size={13} />
          <span>Tùy chọn</span>
        </button>
      </div>

      {/* Custom date range picker */}
      {showCustom && (
        <div className="time-range-custom">
          <div className="time-range-nav">
            <button className="btn btn-secondary" onClick={() => navigateMonth(-1)} style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Điều hướng tháng</span>
            <button className="btn btn-secondary" onClick={() => navigateMonth(1)} style={{ padding: '0.3rem', borderRadius: 'var(--radius-sm)' }}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="time-range-inputs">
            <div className="time-range-input-group">
              <label>Từ ngày</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="input-field" />
            </div>
            <div className="time-range-input-group">
              <label>Đến ngày</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="input-field" />
            </div>
            <button className="btn btn-primary" onClick={handleCustomApply} style={{ alignSelf: 'flex-end', padding: '0.4rem 1rem', fontSize: '0.8rem' }}>
              <Zap size={14} /> Áp dụng
            </button>
          </div>
        </div>
      )}

      {/* Current range display */}
      <div className="time-range-display">
        <Clock size={13} />
        <span>{displayLabel}</span>
      </div>
    </div>
  );
}
