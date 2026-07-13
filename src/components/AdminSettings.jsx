import React, { useState, useEffect } from 'react';
import { db } from '../db';
import { Settings, PlusCircle, Trash2, Save, Eye, EyeOff, Edit3, ShieldAlert, CalendarClock, Layers, CalendarRange, UserPlus, Users } from 'lucide-react';
import { DEFAULT_GOLDEN_CHANNELS, WEEKDAY_LABELS, dayLabel, formatDpEntryWindow, getCycleDatesByDow, formatShortDate, toLocalIsoDate, getCategoryType, findDpCategory } from '../channels';

const WEEKDAY_OPTIONS = WEEKDAY_LABELS.map((label, value) => ({ value, label }));
// 2 ngày liền trước ngày bắt đầu chu kỳ — được tự động tính vào tuần kế tiếp
const rollForwardDays = (startDay) => [(startDay + 5) % 7, (startDay + 6) % 7].map(dayLabel);

export default function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  // New category input state
  const [newCategory, setNewCategory] = useState('');

  // New channel input state
  const [newChannelKey, setNewChannelKey] = useState('');
  const [newChannelTitle, setNewChannelTitle] = useState('');

  // New custom field state
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');

  // Promote Admin State
  const [promoteEmail, setPromoteEmail] = useState('');
  const [promoting, setPromoting] = useState(false);

  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editPosition, setEditPosition] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState('user');
  
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPosition, setNewUserPosition] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await db.settings.get();
      if (error) throw error;
      setSettings(data);
      
      setLoadingProfiles(true);
      const profRes = await db.profiles.getAll();
      setProfiles(profRes.data || []);
    } catch (err) {
      console.error(err);
      showMsg('Không thể tải cấu hình!', 'danger');
    } finally {
      setLoading(false);
      setLoadingProfiles(false);
    }
  };

  const showMsg = (text, type) => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 4000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await db.settings.update(settings);
      if (error) throw error;
      showMsg('Đã lưu cấu hình thành công!', 'success');
    } catch (err) {
      console.error(err);
      showMsg('Không thể lưu cấu hình!', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const handlePromote = async () => {
    if (!promoteEmail.trim()) {
      showMsg('Vui lòng nhập email để nâng cấp!', 'danger');
      return;
    }
    setPromoting(true);
    try {
      const { error } = await db.auth.promoteUser(promoteEmail.trim());
      if (error) throw error;
      showMsg(`Đã nâng cấp ${promoteEmail} thành Admin thành công!`, 'success');
      setPromoteEmail('');
    } catch (err) {
      console.error(err);
      showMsg(err.message || 'Không thể nâng cấp tài khoản này!', 'danger');
    } finally {
      setPromoting(false);
    }
  };

  const handleStartEdit = (p) => {
    setEditingUserId(p.id);
    setEditName(p.full_name);
    setEditPosition(p.position || '');
    setEditRole(p.role || 'user');
    setEditPassword('');
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setEditName('');
    setEditPosition('');
    setEditPassword('');
  };

  const handleSaveProfile = async (p) => {
    if (!editName.trim()) {
      alert('Tên nhân viên không được để trống!');
      return;
    }
    try {
      const { error } = await db.profiles.updateProfile(p.id, editName.trim(), editPosition.trim(), editRole, p.role);
      if (error) {
        console.error("updateProfile error:", error);
        throw new Error(error.message || 'Lỗi khi cập nhật thông tin');
      }
      
      if (editPassword.trim()) {
        const { error: pwdError } = await db.profiles.changePassword(p.id, editPassword.trim());
        if (pwdError) {
          console.error("changePassword error:", pwdError);
          throw new Error(pwdError.message || 'Lỗi khi đổi mật khẩu');
        }
      }
      
      alert('Cập nhật thông tin nhân viên thành công!');
      setEditingUserId(null);
      setEditPassword('');
      const profRes = await db.profiles.getAll();
      setProfiles(profRes.data || []);
    } catch (err) {
      console.error("handleSaveProfile catch error:", err);
      alert(err.message || 'Không thể cập nhật thông tin nhân viên!');
    }
  };

  const handleCreateUser = async () => {
    const email = newUserEmail.trim();
    const password = newUserPassword.trim();
    const name = newUserName.trim();
    const pos = newUserPosition.trim();
    if (!email || !password || !name) {
      alert('Vui lòng nhập đủ Email, Mật khẩu và Họ tên!');
      return;
    }
    setCreatingUser(true);
    try {
      const { error } = await db.profiles.createUser(email, password, name, pos, newUserRole);
      if (error) {
        console.error("createUser error:", error);
        throw new Error(error.message || 'Lỗi khi tạo tài khoản');
      }
      alert(`Đã tạo tài khoản cho nhân viên ${name} thành công!`);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserName('');
      setNewUserPosition('');
      setNewUserRole('user');
      const profRes = await db.profiles.getAll();
      setProfiles(profRes.data || []);
    } catch (err) {
      console.error("handleCreateUser catch error:", err);
      alert(err.message || 'Không thể tạo tài khoản!');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleDeleteUser = async (p) => {
    if (!window.confirm(`CẢNH BÁO CỰC KỲ QUAN TRỌNG:\nXóa tài khoản "${p.full_name}" (${p.role})?\nHành động này sẽ xóa vĩnh viễn tài khoản đăng nhập của nhân viên và TỰ ĐỘNG XÓA TOÀN BỘ BÁO CÁO CŨ cũng như phân công chỉ tiêu của họ.\nBạn có chắc chắn muốn xóa không?`)) return;
    try {
      const { error } = await db.profiles.deleteUser(p.id);
      if (error) {
        console.error("deleteUser error:", error);
        throw new Error(error.message || 'Lỗi khi xóa tài khoản');
      }
      alert(`Đã xóa tài khoản ${p.full_name} thành công!`);
      const profRes = await db.profiles.getAll();
      setProfiles(profRes.data || []);
    } catch (err) {
      console.error("handleDeleteUser catch error:", err);
      alert(err.message || 'Không thể xóa tài khoản này!');
    }
  };

  // --- Category Handlers ---
  const handleAddCategory = () => {
    if (!newCategory.trim()) return;
    if (settings.categories.includes(newCategory.trim())) {
      showMsg('Hạng mục này đã tồn tại!', 'danger');
      return;
    }
    setSettings({
      ...settings,
      categories: [...settings.categories, newCategory.trim()]
    });
    setNewCategory('');
  };

  const handleRemoveCategory = (index) => {
    const cat = settings.categories[index];
    if (!window.confirm(`Xóa hạng mục "${cat}"? Hạng mục sẽ không còn xuất hiện trong menu chọn khi nhân viên nhập báo cáo mới.`)) return;
    const newCategories = [...settings.categories];
    newCategories.splice(index, 1);
    setSettings({ ...settings, categories: newCategories });
  };

  // --- Category Type Handlers (tùy biến kiểu nhập liệu thay cho code cứng theo tên) ---
  // LƯU Ý: khối này chạy ở MỌI lần render — kể cả lần đầu khi settings còn null (đang tải),
  // vì guard "loading" nằm phía dưới. Phải dùng optional chaining, nếu không component sẽ
  // crash ngay khi mount (TypeError: Cannot read properties of null) → trắng trang Cài đặt.
  const currentCategoryTypes = settings?.categoryTypes || {};
  const dpCategoryName = findDpCategory(settings?.categories || []);
  const handleCategoryTypeChange = (cat, type) => {
    setSettings({ ...settings, categoryTypes: { ...currentCategoryTypes, [cat]: type } });
  };

  // --- Channel Handlers ---
  const currentChannels = (settings?.channels && settings.channels.length > 0) ? settings.channels : DEFAULT_GOLDEN_CHANNELS;

  const handleAddChannel = () => {
    const key = newChannelKey.trim().toUpperCase();
    const title = newChannelTitle.trim();
    if (!key || !title) {
      showMsg('Vui lòng nhập đủ mã kênh và tên hiển thị!', 'danger');
      return;
    }
    if (currentChannels.some(c => c.key === key)) {
      showMsg('Mã kênh này đã tồn tại!', 'danger');
      return;
    }
    setSettings({
      ...settings,
      channels: [...currentChannels, { key, title }]
    });
    setNewChannelKey('');
    setNewChannelTitle('');
  };

  const handleChannelChange = (index, field, value) => {
    const newChannels = [...currentChannels];
    newChannels[index] = { ...newChannels[index], [field]: field === 'key' ? value.toUpperCase() : value };
    setSettings({ ...settings, channels: newChannels });
  };

  const handleRemoveChannel = (index) => {
    const ch = currentChannels[index];
    if (!window.confirm(`Xóa kênh "${ch.title}" (${ch.key})? Kênh sẽ không còn hiện ra để nhập tiến độ DP LCD nữa — báo cáo cũ vẫn còn trong hệ thống nhưng sẽ không hiển thị đầy đủ trên các bảng thống kê.`)) return;
    const newChannels = [...currentChannels];
    newChannels.splice(index, 1);
    setSettings({ ...settings, channels: newChannels });
  };

  // --- Weekly Plan Template Handlers ---
  // index 0=CN,1=T2,...6=T7 (khớp Date.getDay()) — mỗi phần tử null hoặc { task_detail, plan_locations, plan_screens, plan_details }
  const currentTemplate = (settings?.weeklyTemplate && settings.weeklyTemplate.length === 7) ? settings.weeklyTemplate : Array(7).fill(null);

  const handleTemplateChange = (dow, field, value) => {
    const newTemplate = [...currentTemplate];
    const entry = newTemplate[dow] || { task_detail: '', plan_locations: '', plan_screens: '', plan_details: '' };
    newTemplate[dow] = { ...entry, [field]: value };
    setSettings({ ...settings, weeklyTemplate: newTemplate });
  };

  const handleClearTemplateDay = (dow) => {
    const newTemplate = [...currentTemplate];
    newTemplate[dow] = null;
    setSettings({ ...settings, weeklyTemplate: newTemplate });
  };

  // Thứ tự hiển thị lưới lịch: bắt đầu từ "Ngày bắt đầu chu kỳ" đã cấu hình (thay vì luôn CN→T7 cứng
  // nhắc) — VD chu kỳ bắt đầu Thứ 2 thì lưới hiện Thứ 2→CN, đúng với cách nhân viên hình dung 1 tuần làm việc.
  // Kèm ngày tháng năm cụ thể của tuần hiện tại để dễ hình dung áp dụng cho ngày nào, và tô đậm ô "Hôm nay".
  const templateWeekStartDay = settings?.weekStartDay ?? 1;
  const templateCycleDates = getCycleDatesByDow(templateWeekStartDay);
  const templateTodayIso = toLocalIsoDate();
  const orderedTemplateDows = Array.from({ length: 7 }, (_, i) => (templateWeekStartDay + i) % 7);

  // --- Field Handlers ---
  const handleFieldChange = (id, key, value) => {
    const newFields = [...settings.fields];
    const index = newFields.findIndex(f => f.id === id);
    if (index > -1) {
      newFields[index] = { ...newFields[index], [key]: value };
      setSettings({ ...settings, fields: newFields });
    }
  };

  const handleAddCustomField = () => {
    if (!newFieldLabel.trim()) return;
    const newField = {
      id: `custom_${Date.now()}`,
      label: newFieldLabel.trim(),
      type: newFieldType,
      required: false,
      enabled: true,
      isCustom: true
    };
    setSettings({
      ...settings,
      fields: [...settings.fields, newField]
    });
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const handleRemoveField = (id) => {
    const field = settings.fields.find(f => f.id === id);
    if (!window.confirm(`Xóa trường tự do "${field?.label || id}"? Trường này sẽ không còn hiện trong form nhập báo cáo nữa.`)) return;
    const newFields = settings.fields.filter(f => f.id !== id);
    setSettings({ ...settings, fields: newFields });
  };

  if (loading || !settings) {
    return (
      <div className="container" style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner" style={{ width: '2rem', height: '2rem', color: 'var(--accent-color)', margin: '0 auto' }}></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Đang tải cấu hình...</p>
      </div>
    );
  }

  return (
    <div className="container" style={{ marginTop: '2rem', paddingBottom: '3rem' }}>

      {message.text && (
        <div className={`alert alert-${message.type}`} style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>

        {/* Lớp cấu hình Chu kỳ tuần */}
        <div className="card-glass" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', color: 'var(--accent-color)' }}>
              <CalendarClock size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Chu kỳ tuần báo cáo</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            "Tuần" của mỗi báo cáo giờ được hệ thống <strong>tự động tính từ ngày báo cáo</strong>, nhân viên không cần nhập tay nữa.
            Chọn ngày bắt đầu chu kỳ tuần bên dưới — 2 ngày liền trước ngày bắt đầu sẽ tự động được tính vào tuần sắp tới
            (đúng với quy trình: kỹ thuật thường đi thay chương trình DP LCD vào 2 ngày cuối tuần cho tuần làm việc kế tiếp).
          </p>

          <div className="form-group" style={{ maxWidth: '280px' }}>
            <label className="form-label">Ngày bắt đầu chu kỳ</label>
            <select
              className="form-control input-field"
              value={settings.weekStartDay ?? 1}
              onChange={(e) => setSettings({ ...settings, weekStartDay: parseInt(e.target.value) })}
            >
              {WEEKDAY_OPTIONS.map(d => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>

          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
            Ví dụ: {rollForwardDays(settings.weekStartDay ?? 1).join(' & ')} sẽ được tính là tuần của {dayLabel(settings.weekStartDay ?? 1)} kế tiếp.
          </p>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Cửa sổ nhập tiến độ DP LCD cũng tự dịch theo lựa chọn này: nhân viên sẽ nhập vào <strong>{formatDpEntryWindow(settings.weekStartDay ?? 1, 'list')}</strong>,
            qua các ngày còn lại mà chưa nhập đủ vị trí sẽ bị coi là quá hạn và cần nêu lý do.
          </p>
        </div>

        {/* Lớp quản lý Hạng mục công việc */}
        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', color: 'var(--accent-color)' }}>
              <Settings size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Hạng mục công việc</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Quản lý các hạng mục công việc được hiển thị trong menu thả xuống khi nhân viên nhập báo cáo.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Tên hạng mục mới..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <button className="btn btn-primary" onClick={handleAddCategory}>
              <PlusCircle size={18} /> Thêm
            </button>
          </div>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            "Kiểu nhập liệu" quyết định form báo cáo hiện ra gì cho hạng mục đó: <strong>Thường</strong> (Kế hoạch/Thực tế đơn giản),
            <strong> Theo kênh</strong> (nhập riêng từng kênh hệ thống Golden, giống DP LCD nhưng không có cửa sổ nhập/lý do trễ hạn riêng),
            hoặc <strong>Lũy kế tuần</strong> (khai Tổng số 1 lần đầu tuần, cập nhật Đã hoàn thành mỗi ngày — giống "Tiến độ GP").
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {settings.categories.map((cat, idx) => {
              const isDp = !!dpCategoryName && cat === dpCategoryName;
              const resolvedType = getCategoryType(currentCategoryTypes, cat, settings.categories);
              return (
                <div key={idx} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem',
                  padding: '0.75rem', background: 'var(--surface-inset)',
                  border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
                    <span>{cat}</span>
                    {isDp ? (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Dùng cơ chế riêng của DP LCD (theo kênh + cửa sổ nhập + lý do trễ hạn) — không đổi kiểu được.
                      </span>
                    ) : (
                      <select
                        className="form-control"
                        value={resolvedType}
                        onChange={(e) => handleCategoryTypeChange(cat, e.target.value)}
                        style={{ fontSize: '0.8rem', maxWidth: 260 }}
                      >
                        <option value="normal">Thường (KH/TT đơn giản)</option>
                        <option value="channel">Theo kênh (như DP LCD)</option>
                        <option value="weekly_cumulative">Lũy kế tuần (Tổng + Đã hoàn thành)</option>
                      </select>
                    )}
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem', color: 'var(--danger)' }}
                    onClick={() => handleRemoveCategory(idx)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
            {settings.categories.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Chưa có hạng mục nào.</p>
            )}
          </div>
        </div>

        {/* Lớp quản lý Kênh hệ thống Golden Asia */}
        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', color: 'var(--accent-color)' }}>
              <Layers size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Kênh hệ thống Golden Asia</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Danh sách kênh dùng để phân bổ và nhập tiến độ DP LCD (mỗi kênh gồm mã ngắn và tên hiển thị).
            Thêm/sửa/xóa kênh tại đây sẽ áp dụng cho toàn bộ ứng dụng.
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            ⚠ Mã kênh không thể sửa sau khi tạo — vì báo cáo/tiến độ cũ đã lưu theo mã này, đổi mã sẽ làm mất liên kết với dữ liệu lịch sử.
            Chỉ tên hiển thị là sửa được. Muốn đổi mã, hãy xóa kênh cũ và thêm kênh mới.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Mã kênh (vd: GYM)"
              value={newChannelKey}
              onChange={(e) => setNewChannelKey(e.target.value)}
              style={{ flex: 1 }}
            />
            <input
              type="text"
              className="form-control"
              placeholder="Tên hiển thị (vd: Gym & Fitness)"
              value={newChannelTitle}
              onChange={(e) => setNewChannelTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddChannel()}
              style={{ flex: 2 }}
            />
            <button className="btn btn-primary" onClick={handleAddChannel}>
              <PlusCircle size={18} /> Thêm
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {currentChannels.map((ch, idx) => (
              <div key={idx} style={{
                display: 'flex', gap: '0.5rem', alignItems: 'center',
                padding: '0.75rem', background: 'var(--surface-inset)',
                border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)'
              }}>
                <input
                  type="text"
                  className="form-control"
                  value={ch.key}
                  disabled
                  title="Mã kênh không thể sửa sau khi tạo (để giữ liên kết với dữ liệu lịch sử)"
                  style={{ flex: 1, fontFamily: 'monospace', opacity: 0.6, cursor: 'not-allowed' }}
                />
                <input
                  type="text"
                  className="form-control"
                  value={ch.title}
                  onChange={(e) => handleChannelChange(idx, 'title', e.target.value)}
                  style={{ flex: 2 }}
                />
                <button
                  className="btn btn-secondary"
                  style={{ padding: '0.25rem', color: 'var(--danger)' }}
                  onClick={() => handleRemoveChannel(idx)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            {currentChannels.length === 0 && (
              <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Chưa có kênh nào.</p>
            )}
          </div>
        </div>

        {/* Lớp quản lý Lịch mẫu kế hoạch theo tuần */}
        <div className="card-glass" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', color: 'var(--accent-color)' }}>
              <CalendarRange size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Lịch mẫu kế hoạch theo tuần</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Đặt sẵn hạng mục công việc (và số lượng/chi tiết dự kiến nếu muốn) cho từng ngày trong tuần.
            Khi nhân viên chọn "Ngày báo cáo" ứng với thứ đã đặt lịch mẫu, mục "Kế hoạch dự kiến" sẽ tự điền theo lịch này —
            không cần đặt cho tất cả các ngày, ngày nào để trống thì nhân viên tự nhập như bình thường.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
            {orderedTemplateDows.map((dow) => {
              const entry = currentTemplate[dow];
              const isToday = templateCycleDates[dow] === templateTodayIso;
              const hasEntry = !!entry?.task_detail;
              return (
                <div key={dow} style={{
                  display: 'flex', flexDirection: 'column', gap: '0.5rem',
                  padding: '0.75rem', borderRadius: 'var(--radius-md)',
                  background: isToday ? 'var(--accent-glow)' : 'var(--surface-inset)',
                  border: isToday ? '1.5px solid var(--accent-color)' : '1px solid var(--border-glass)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong style={{ fontSize: '0.95rem' }}>{dayLabel(dow)}</strong>
                    <span style={{ fontSize: '0.72rem', color: isToday ? 'var(--accent-color)' : 'var(--text-muted)', fontWeight: isToday ? 700 : 400 }}>
                      {isToday ? 'Hôm nay' : formatShortDate(templateCycleDates[dow])}
                    </span>
                  </div>

                  <select
                    className="form-control"
                    value={entry?.task_detail || ''}
                    onChange={(e) => handleTemplateChange(dow, 'task_detail', e.target.value)}
                  >
                    <option value="">— Không đặt lịch —</option>
                    {settings.categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>

                  {hasEntry && (
                    <>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input type="number" min="0" className="form-control" placeholder="Đ.điểm"
                          value={entry.plan_locations ?? ''}
                          onChange={(e) => handleTemplateChange(dow, 'plan_locations', e.target.value)}
                          style={{ flex: 1, minWidth: 0 }} title="Số địa điểm dự kiến" />
                        <input type="number" min="0" className="form-control" placeholder="Màn hình"
                          value={entry.plan_screens ?? ''}
                          onChange={(e) => handleTemplateChange(dow, 'plan_screens', e.target.value)}
                          style={{ flex: 1, minWidth: 0 }} title="Số màn hình dự kiến" />
                      </div>
                      <input type="text" className="form-control" placeholder="Chi tiết dự kiến (tùy chọn)"
                        value={entry.plan_details || ''}
                        onChange={(e) => handleTemplateChange(dow, 'plan_details', e.target.value)} />
                      <button className="btn btn-secondary" style={{ padding: '0.3rem', color: 'var(--danger)', fontSize: '0.75rem', alignSelf: 'flex-end' }}
                        onClick={() => handleClearTemplateDay(dow)} title="Bỏ lịch mẫu ngày này">
                        <Trash2 size={14} /> Bỏ lịch
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Lớp quản lý Tùy biến Dòng nhập (Fields) */}
        <div className="card-glass">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'var(--info-bg)', borderRadius: 'var(--radius-md)', color: 'var(--info)' }}>
              <Edit3 size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Tùy biến dòng nhập liệu</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Thay đổi tên hoặc Ẩn/Hiện các trường thông tin trong form báo cáo. Hoặc tự tạo thêm trường mới.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h4 style={{ fontSize: '1rem', color: 'var(--accent-color)', margin: 0 }}>Trường hệ thống cơ bản</h4>
            {settings.fields.filter(f => !f.isCustom).map((field) => (
              <div key={field.id} style={{
                padding: '1rem', background: 'var(--surface-inset)',
                border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <strong style={{ opacity: field.enabled ? 1 : 0.5 }}>{field.id}</strong>
                  <button
                    className={`btn ${field.enabled ? 'btn-secondary' : 'btn-secondary'}`}
                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: field.enabled ? 'var(--success)' : 'var(--text-muted)' }}
                    onClick={() => handleFieldChange(field.id, 'enabled', !field.enabled)}
                  >
                    {field.enabled ? <><Eye size={14}/> Đang hiện</> : <><EyeOff size={14}/> Đang ẩn</>}
                  </button>
                </div>

                <div className="form-group" style={{ marginBottom: 0, opacity: field.enabled ? 1 : 0.5 }}>
                  <label>Tên hiển thị (Label):</label>
                  <input
                    type="text"
                    className="form-control"
                    value={field.label}
                    onChange={(e) => handleFieldChange(field.id, 'label', e.target.value)}
                    disabled={!field.enabled}
                  />
                </div>
              </div>
            ))}

            <hr style={{ borderColor: 'var(--border-glass)', margin: '1rem 0' }} />

            <h4 style={{ fontSize: '1rem', color: 'var(--success)', margin: 0 }}>Trường tự do (Custom Fields)</h4>

            {/* Thêm trường tự do mới */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Tên trường mới (vd: Kế hoạch tuần tới)"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                style={{ flex: 2 }}
              />
              <select
                className="form-control"
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="text">Dòng văn bản ngắn</option>
                <option value="textarea">Văn bản dài (Nhiều dòng)</option>
              </select>
              <button className="btn btn-primary" onClick={handleAddCustomField}>
                <PlusCircle size={18} /> Thêm
              </button>
            </div>

            {settings.fields.filter(f => f.isCustom).map((field) => (
              <div key={field.id} style={{
                padding: '1rem', background: 'var(--surface-inset)',
                border: '1px solid var(--success)', borderRadius: 'var(--radius-sm)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <strong style={{ opacity: field.enabled ? 1 : 0.5, color: 'var(--success)' }}>
                    {field.id} ({field.type === 'textarea' ? 'Nhiều dòng' : 'Dòng ngắn'})
                  </strong>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className={`btn ${field.enabled ? 'btn-secondary' : 'btn-secondary'}`}
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: field.enabled ? 'var(--success)' : 'var(--text-muted)' }}
                      onClick={() => handleFieldChange(field.id, 'enabled', !field.enabled)}
                    >
                      {field.enabled ? <><Eye size={14}/> Đang hiện</> : <><EyeOff size={14}/> Đang ẩn</>}
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', color: 'var(--danger)' }}
                      onClick={() => handleRemoveField(field.id)}
                    >
                      <Trash2 size={14}/> Xóa
                    </button>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0, opacity: field.enabled ? 1 : 0.5 }}>
                  <label>Tên hiển thị (Label):</label>
                  <input
                    type="text"
                    className="form-control"
                    value={field.label}
                    onChange={(e) => handleFieldChange(field.id, 'label', e.target.value)}
                    disabled={!field.enabled}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ padding: '0.75rem 1.5rem' }}>
              {saving ? <div className="spinner" style={{ width: '1.25rem', height: '1.25rem' }}></div> : <Save size={18} />}
              <span style={{ marginLeft: '0.5rem' }}>{saving ? 'Đang lưu...' : 'Lưu lại thay đổi'}</span>
            </button>
          </div>
        </div>

        {/* Lớp quản lý Thành viên / Tài khoản nhân viên */}
        <div className="card-glass" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'var(--accent-glow)', borderRadius: 'var(--radius-md)', color: 'var(--accent-color)' }}>
              <Users size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Quản lý tài khoản Nhân viên</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Xem danh sách, sửa thông tin họ tên, chức vụ, thay đổi quyền Admin hoặc xóa vĩnh viễn tài khoản nhân viên.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
            {/* Form tạo tài khoản mới */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '1rem', borderRight: '1px solid var(--border-glass)' }}>
              <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.5rem 0', color: 'var(--accent-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserPlus size={16} /> Tạo tài khoản mới
              </h4>
              
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Email đăng nhập *</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="nhanvien@example.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Mật khẩu khởi tạo *</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Nhập mật khẩu..."
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Họ tên nhân viên *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Nguyễn Văn A"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Chức danh / Vị trí</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Kỹ thuật viên, CTV..."
                  value={newUserPosition}
                  onChange={(e) => setNewUserPosition(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>Quyền truy cập</label>
                <select
                  className="form-control"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                >
                  <option value="user">Nhân viên (User)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
              </div>

              <button className="btn btn-primary" onClick={handleCreateUser} disabled={creatingUser} style={{ marginTop: '0.5rem', alignSelf: 'flex-start' }}>
                {creatingUser ? <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div> : <PlusCircle size={16} />}
                <span style={{ marginLeft: '0.4rem' }}>{creatingUser ? 'Đang tạo...' : 'Tạo tài khoản'}</span>
              </button>
            </div>

            {/* Danh sách tài khoản hiện tại */}
            <div>
              <h4 style={{ fontSize: '0.95rem', margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>
                Danh sách tài khoản ({profiles.length})
              </h4>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {profiles.map(p => {
                  const isEditing = editingUserId === p.id;
                  return (
                    <div key={p.id} className="card-glass" style={{
                      padding: '0.75rem', background: 'var(--surface-inset)',
                      border: isEditing ? '1px solid var(--accent-color)' : '1px solid var(--border-glass)',
                      display: 'flex', flexDirection: 'column', gap: '0.5rem'
                    }}>
                      {isEditing ? (
                        /* Chế độ Sửa */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <div style={{ flex: 2 }}>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Họ tên</label>
                              <input
                                type="text"
                                className="form-control"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                            <div style={{ flex: 1.5 }}>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Chức vụ</label>
                              <input
                                type="text"
                                className="form-control"
                                value={editPosition}
                                onChange={(e) => setEditPosition(e.target.value)}
                                style={{ fontSize: '0.85rem' }}
                              />
                            </div>
                          </div>
                           <div style={{ display: 'flex', gap: '0.5rem' }}>
                             <div style={{ flex: 1 }}>
                               <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Vai trò</label>
                               <select
                                 className="form-control"
                                 value={editRole}
                                 onChange={(e) => setEditRole(e.target.value)}
                                 style={{ fontSize: '0.85rem' }}
                               >
                                 <option value="user">Nhân viên (User)</option>
                                 <option value="admin">Quản trị viên (Admin)</option>
                               </select>
                             </div>
                             <div style={{ flex: 1.5 }}>
                               <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Mật khẩu mới</label>
                               <input
                                 type="password"
                                 className="form-control"
                                 placeholder="Trống nếu không đổi..."
                                 value={editPassword}
                                 onChange={(e) => setEditPassword(e.target.value)}
                                 style={{ fontSize: '0.85rem' }}
                               />
                             </div>
                           </div>
                          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                            <button className="btn btn-primary" onClick={() => handleSaveProfile(p)} style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>Lưu</button>
                            <button className="btn btn-secondary" onClick={handleCancelEdit} style={{ padding: '0.25rem 0.75rem', fontSize: '0.75rem' }}>Hủy</button>
                          </div>
                        </div>
                      ) : (
                        /* Chế độ Xem */
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{p.full_name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {p.position || 'Chưa đặt chức danh'} • <span className={`badge ${p.role === 'admin' ? 'badge-danger' : 'badge-success'}`} style={{ padding: '0.05rem 0.25rem', fontSize: '0.65rem' }}>{p.role}</span>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button className="btn btn-secondary" onClick={() => handleStartEdit(p)} style={{ padding: '0.3rem', color: 'var(--accent-color)' }} title="Sửa tài khoản">
                              <Edit3 size={14} />
                            </button>
                            <button className="btn btn-secondary" onClick={() => handleDeleteUser(p)} style={{ padding: '0.3rem', color: 'var(--danger)' }} title="Xóa tài khoản">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Lớp quản lý Nâng cấp Admin */}
        <div className="card-glass" style={{ gridColumn: '1 / -1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-md)', color: '#f87171' }}>
              <ShieldAlert size={20} />
            </div>
            <h3 style={{ fontSize: '1.25rem', margin: 0 }}>Nâng cấp Quản trị viên (Admin)</h3>
          </div>

          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Nhập email của nhân viên (đã đăng ký tài khoản) để cấp quyền Admin cho họ. Họ sẽ có toàn quyền xem mọi báo cáo và thay đổi cấu hình.
          </p>

          <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '500px' }}>
            <input
              type="email"
              className="form-control"
              placeholder="Nhập email nhân viên cần nâng cấp..."
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePromote()}
            />
            <button className="btn btn-primary" onClick={handlePromote} disabled={promoting} style={{ minWidth: '120px' }}>
              {promoting ? <div className="spinner" style={{ width: '1rem', height: '1rem' }}></div> : 'Nâng cấp'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
