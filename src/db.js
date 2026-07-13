import { supabase, isSupabaseConfigured } from './supabase';
import { MOCK_USERS_SEED, MOCK_REPORTS_SEED } from './mockData';
import { DEFAULT_GOLDEN_CHANNELS } from './channels';

// Seeded Mock Data derived from "Tổng hợp báo cáo cv ngày 06.07.xlsx"
const DEFAULT_MOCK_REPORTS = MOCK_REPORTS_SEED;
const DEFAULT_MOCK_USERS = MOCK_USERS_SEED;

// Helper functions for LocalStorage Mock Database with automatic _v2 suffix to force new excel seed data
const getMockData = (key, defaultValue) => {
  const v2Key = key + '_v2';
  const data = localStorage.getItem(v2Key);
  if (!data) {
    localStorage.setItem(v2Key, JSON.stringify(defaultValue));
    return defaultValue;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return defaultValue;
  }
};

const setMockData = (key, data) => {
  localStorage.setItem(key + '_v2', JSON.stringify(data));
};

// Initialize Mock Databases
const DEFAULT_SETTINGS = {
  // Ngày bắt đầu chu kỳ tuần: 0=CN,1=T2,...6=T7. Mặc định Thứ 2 — 2 ngày cuối chu kỳ (T7,CN)
  // sẽ tự động tính vào tuần kế tiếp (tuần của Thứ 2 sắp tới).
  weekStartDay: 1,
  // Danh sách kênh hệ thống Golden (dùng cho báo cáo/khai phụ trách DP LCD) — admin tùy biến trong Cài đặt
  channels: DEFAULT_GOLDEN_CHANNELS,
  // Lịch mẫu kế hoạch theo từng ngày trong tuần (admin đặt trong Cài đặt) — chỉ số 0=CN,1=T2,...6=T7,
  // khớp với Date.getDay(). Mỗi phần tử: { task_detail, plan_locations, plan_screens, plan_details } hoặc null
  // nếu ngày đó chưa đặt lịch mẫu. Dùng để tự gợi ý/điền "Kế hoạch dự kiến" khi nhân viên chọn ngày báo cáo.
  weeklyTemplate: Array(7).fill(null),
  categories: [
    'Tiến độ  DP LCD ',
    'Tiến độ GP',
    'Tháo GP',
    'Lắp đặt',
    'Bảo trì',
    'Làm file',
    'Hỗ trợ'
  ],
  // Kiểu nhập liệu tùy biến cho từng hạng mục (thay cho việc code cứng theo TÊN hạng mục) —
  // { [tên hạng mục]: 'normal' | 'channel' | 'weekly_cumulative' }. Hạng mục chưa được cấu hình
  // ở đây sẽ mặc định 'normal' (trừ DP LCD/GP khớp tên cũ vẫn có fallback tương thích ngược,
  // xem getCategoryType() trong channels.js).
  categoryTypes: {
    'Tiến độ GP': 'weekly_cumulative'
  },
  fields: [
    { id: 'plan_locations', label: 'Kế hoạch (Số địa điểm)', type: 'number', required: false, enabled: true, isSystem: true },
    { id: 'plan_screens', label: 'Kế hoạch (Số màn hình)', type: 'number', required: false, enabled: true, isSystem: true },
    { id: 'plan_details', label: 'Kế hoạch (Chi tiết công việc)', type: 'text', required: true, enabled: true, isSystem: true },
    { id: 'actual_locations', label: 'Thực tế (Số địa điểm)', type: 'number', required: false, enabled: true, isSystem: true },
    { id: 'actual_screens', label: 'Thực tế (Số màn hình)', type: 'number', required: false, enabled: true, isSystem: true },
    { id: 'actual_details', label: 'Thực tế (Chi tiết công việc)', type: 'text', required: true, enabled: true, isSystem: true },
    { id: 'notes', label: 'Ghi chú', type: 'text', required: false, enabled: true, isSystem: true },
    { id: 'custom_plan_next_week', label: 'Kế hoạch tuần tới', type: 'textarea', required: false, enabled: false, isCustom: true }
  ]
};

let mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
let mockReports = getMockData('bctd_mock_reports', DEFAULT_MOCK_REPORTS);
let currentMockUser = getMockData('bctd_current_user', null);
let mockSettings = getMockData('bctd_mock_settings', DEFAULT_SETTINGS);

// ─── Helper: filter mock reports by date range ───────────────────────────────
function filterByDateRange(reports, startDate, endDate) {
  if (!startDate && !endDate) return reports;
  return reports.filter(r => {
    const d = r.date; // ISO string 'YYYY-MM-DD'
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  });
}

export const db = {
  // ═══════════════════════════════════════════════════════════════════════════
  // Authentication API
  // ═══════════════════════════════════════════════════════════════════════════
  auth: {
    async signUp(email, password, fullName, position, role = 'user') {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                position: position,
                role: role
              }
            }
          });
          if (error) throw error;
          
          // Profile is auto-created by the database trigger (handle_new_user)
          // but we wait a moment for it to propagate
          if (data.user) {
            const table = role === 'admin' ? 'admins' : 'users';
            await supabase
              .from(table)
              .upsert({
                id: data.user.id,
                full_name: fullName,
                position: position
              }, { onConflict: 'id' });
          }
          return { user: data.user, error: null };
        } catch (error) {
          return { user: null, error };
        }
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          setTimeout(() => {
            const exists = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
            if (exists) {
              resolve({ user: null, error: new Error('Email đã tồn tại trong hệ thống demo!') });
              return;
            }
            const newUser = {
              id: 'mock-user-' + Math.random().toString(36).substr(2, 9),
              email,
              password, // Storing plaintext for demo only
              full_name: fullName,
              position,
              role
            };
            mockUsers.push(newUser);
            setMockData('bctd_mock_users', mockUsers);
            
            // Auto login
            currentMockUser = newUser;
            setMockData('bctd_current_user', currentMockUser);
            
            resolve({ user: newUser, error: null });
          }, 300);
        });
      }
    },

    async signIn(email, password) {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
          });
          if (error) throw error;

          // Fetch profile details
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
          
          if (profileError) throw profileError;

          const userWithProfile = {
            ...data.user,
            full_name: profile.full_name,
            position: profile.position,
            role: profile.role
          };

          return { user: userWithProfile, error: null };
        } catch (error) {
          return { user: null, error };
        }
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          setTimeout(() => {
            let user = mockUsers.find(
              u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
            );

            // Auto inject demo accounts if they don't exist in local storage yet
            if (!user && password === 'password123' && (email.toLowerCase() === 'admin@example.com' || email.toLowerCase() === 'tam@example.com')) {
              user = {
                id: email.toLowerCase() === 'admin@example.com' ? 'demo-admin' : 'demo-tam',
                email: email.toLowerCase(),
                password: 'password123',
                full_name: email.toLowerCase() === 'admin@example.com' ? 'Demo Admin' : 'Demo Nhân Viên',
                position: email.toLowerCase() === 'admin@example.com' ? 'Quản trị viên' : 'Nhân viên',
                role: email.toLowerCase() === 'admin@example.com' ? 'admin' : 'user'
              };
              mockUsers.push(user);
              setMockData('bctd_mock_users', mockUsers);
            }

            if (!user) {
              resolve({ user: null, error: new Error('Tài khoản hoặc mật khẩu demo không đúng!') });
              return;
            }
            currentMockUser = user;
            setMockData('bctd_current_user', currentMockUser);
            resolve({ user, error: null });
          }, 300);
        });
      }
    },

    async signOut() {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.signOut();
        return { error };
      } else {
        currentMockUser = null;
        setMockData('bctd_current_user', null);
        return { error: null };
      }
    },

    async getCurrentUser() {
      if (isSupabaseConfigured) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return null;

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          return {
            ...user,
            full_name: profile?.full_name || user.email,
            position: profile?.position || '',
            role: profile?.role || 'user'
          };
        } catch (e) {
          return null;
        }
      } else {
        return currentMockUser;
      }
    },

    async promoteUser(email) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.rpc('promote_to_admin', { target_email: email });
        return { data, error };
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          const user = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (!user) {
            resolve({ error: new Error('Không tìm thấy tài khoản với email này') });
            return;
          }
          user.role = 'admin';
          user.position = 'Quản trị viên mới';
          setMockData('bctd_mock_users', mockUsers);
          resolve({ data: true, error: null });
        });
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Profiles API (danh sách nhân viên / admin)
  // ═══════════════════════════════════════════════════════════════════════════
  profiles: {
    /** Get all profiles (admins + users). Admin RLS allows reading all users. */
    async getAll() {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, position, role')
          .order('full_name', { ascending: true });
        return { data: data || [], error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          resolve({
            data: mockUsers.map(u => ({
              id: u.id,
              full_name: u.full_name,
              position: u.position,
              role: u.role
            })),
            error: null
          });
        });
      }
    },

    /**
     * Get report defaults for an employee (auto-fill kế hoạch).
     * Returns { default_locations, default_screens, default_task, default_plan_details }
     */
    async getDefaults(userId) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('users')
          .select('default_locations, default_screens, default_task, default_plan_details')
          .eq('id', userId)
          .maybeSingle();
        return { data: data || {}, error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          const u = mockUsers.find(x => x.id === userId) || {};
          resolve({
            data: {
              default_locations: u.default_locations ?? null,
              default_screens: u.default_screens ?? null,
              default_task: u.default_task ?? null,
              default_plan_details: u.default_plan_details ?? null
            },
            error: null
          });
        });
      }
    },

    /** Save report defaults for an employee. */
    async updateDefaults(userId, defaults) {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('users')
          .update({
            default_locations: defaults.default_locations,
            default_screens: defaults.default_screens,
            default_task: defaults.default_task,
            default_plan_details: defaults.default_plan_details
          })
          .eq('id', userId);
        return { error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          const idx = mockUsers.findIndex(x => x.id === userId);
          if (idx !== -1) {
            mockUsers[idx] = { ...mockUsers[idx], ...defaults };
            setMockData('bctd_mock_users', mockUsers);
          }
          resolve({ error: null });
        });
      }
    },

    /** Update employee profile info (Admin) */
    async updateProfile(userId, fullName, position, role, oldRole) {
      if (isSupabaseConfigured) {
        const targetTable = role === 'admin' ? 'admins' : 'users';
        const { error } = await supabase
          .from(targetTable)
          .upsert({ id: userId, full_name: fullName, position });
          
        if (oldRole && oldRole !== role) {
          const deleteTable = oldRole === 'admin' ? 'admins' : 'users';
          await supabase.from(deleteTable).delete().eq('id', userId);
        }
        return { error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          const idx = mockUsers.findIndex(u => u.id === userId);
          if (idx !== -1) {
            mockUsers[idx].full_name = fullName;
            mockUsers[idx].position = position;
            mockUsers[idx].role = role;
            setMockData('bctd_mock_users', mockUsers);
          }
          resolve({ error: null });
        });
      }
    },

    /** Create a new employee account (Admin) */
    async createUser(email, password, fullName, position, role) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.rpc('create_user_by_admin', {
          new_email: email,
          new_password: password,
          new_name: fullName,
          new_position: position,
          new_role: role
        });
        return { data, error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          const exists = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
          if (exists) {
            resolve({ data: null, error: new Error('Email đã tồn tại!') });
            return;
          }
          const newUser = {
            id: 'mock-user-' + Math.random().toString(36).substr(2, 9),
            email,
            password,
            full_name: fullName,
            position,
            role
          };
          mockUsers.push(newUser);
          setMockData('bctd_mock_users', mockUsers);
          resolve({ data: newUser, error: null });
        });
      }
    },

    /** Delete employee account (Admin) */
    async deleteUser(userId) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.rpc('delete_user', { target_uuid: userId });
        return { error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          mockUsers = mockUsers.filter(u => u.id !== userId);
          setMockData('bctd_mock_users', mockUsers);
          resolve({ error: null });
        });
      }
    },

    /** Change employee password (Admin) */
    async changePassword(userId, newPassword) {
      if (isSupabaseConfigured) {
        const { error } = await supabase.rpc('change_user_password_by_admin', {
          target_uuid: userId,
          new_password: newPassword
        });
        return { error };
      } else {
        return new Promise((resolve) => {
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          const idx = mockUsers.findIndex(u => u.id === userId);
          if (idx !== -1) {
            mockUsers[idx].password = newPassword;
            setMockData('bctd_mock_users', mockUsers);
          }
          resolve({ error: null });
        });
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Work Reports API
  // ═══════════════════════════════════════════════════════════════════════════
  reports: {
    /**
     * Get all reports, optionally filtered by date range.
     * @param {string|null} startDate - ISO date string 'YYYY-MM-DD' or null
     * @param {string|null} endDate - ISO date string 'YYYY-MM-DD' or null
     */
    async getAll(startDate = null, endDate = null) {
      if (isSupabaseConfigured) {
        let query = supabase
          .from('reports')
          .select('*')
          .order('date', { ascending: false });
        
        // Apply date range filter at database level
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        const { data: reportsData, error } = await query;
        
        if (error) return { data: [], error };
        
        // Fetch profiles manually to join since profiles is now a view
        const userIds = [...new Set(reportsData.map(r => r.user_id))];
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, full_name, position, role')
          .in('id', userIds);
          
        const profileMap = {};
        if (profilesData) {
          profilesData.forEach(p => {
            profileMap[p.id] = p;
          });
        }
        
        // Map to uniform structure
        const mappedData = reportsData.map(item => ({
          ...item,
          profiles: profileMap[item.user_id] || null,
          employee_name: profileMap[item.user_id]?.full_name || 'Nhân viên',
          role_name: profileMap[item.user_id]?.position || 'Kỹ thuật viên'
        }));
        
        return { data: mappedData, error: null };
      } else {
        // Mock Implementation with date filtering
        return new Promise((resolve) => {
          mockReports = getMockData('bctd_mock_reports', DEFAULT_MOCK_REPORTS);
          let result = [...mockReports].sort((a, b) => new Date(b.date) - new Date(a.date));
          result = filterByDateRange(result, startDate, endDate);
          resolve({ data: result, error: null });
        });
      }
    },

    /**
     * Get reports for a specific user, optionally filtered by date range.
     */
    async getByUser(userId, startDate = null, endDate = null) {
      if (isSupabaseConfigured) {
        let query = supabase
          .from('reports')
          .select('*')
          .eq('user_id', userId)
          .order('date', { ascending: false });
        
        if (startDate) query = query.gte('date', startDate);
        if (endDate) query = query.lte('date', endDate);

        const { data, error } = await query;
        return { data, error };
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          mockReports = getMockData('bctd_mock_reports', DEFAULT_MOCK_REPORTS);
          let filtered = mockReports.filter(r => r.user_id === userId);
          filtered = filterByDateRange(filtered, startDate, endDate);
          resolve({ data: [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date)), error: null });
        });
      }
    },

    /**
     * Get aggregated statistics for reports in a date range.
     * Returns per-employee stats and overall totals.
     */
    async getStats(startDate = null, endDate = null) {
      const { data: reports, error } = await this.getAll(startDate, endDate);
      if (error) return { stats: null, error };

      const employeeMap = {};
      let totalPlanScreens = 0, totalActScreens = 0;
      let totalPlanLocs = 0, totalActLocs = 0;
      let completed = 0, inProgress = 0, needHelp = 0, late = 0;

      reports.forEach(r => {
        // Overall
        totalPlanScreens += (r.plan_screens || 0);
        totalActScreens += (r.actual_screens || 0);
        totalPlanLocs += (r.plan_locations || 0);
        totalActLocs += (r.actual_locations || 0);
        if (r.progress_eval === 'Hoàn thành') completed++;
        else if (r.progress_eval === 'Đang thực hiện') inProgress++;
        else if (r.progress_eval === 'Cần hỗ trợ') needHelp++;
        else if (r.progress_eval === 'Trễ hạn') late++;

        // Per employee
        const key = r.employee_name || r.user_id;
        if (!employeeMap[key]) {
          employeeMap[key] = {
            name: r.employee_name || 'Nhân viên',
            role: r.role_name || 'Kỹ thuật viên',
            userId: r.user_id,
            totalReports: 0,
            planScreens: 0, actualScreens: 0,
            planLocations: 0, actualLocations: 0,
            completed: 0, inProgress: 0, needHelp: 0, late: 0,
            tasks: new Set()
          };
        }
        const e = employeeMap[key];
        e.totalReports++;
        e.planScreens += (r.plan_screens || 0);
        e.actualScreens += (r.actual_screens || 0);
        e.planLocations += (r.plan_locations || 0);
        e.actualLocations += (r.actual_locations || 0);
        if (r.progress_eval === 'Hoàn thành') e.completed++;
        else if (r.progress_eval === 'Đang thực hiện') e.inProgress++;
        else if (r.progress_eval === 'Cần hỗ trợ') e.needHelp++;
        else if (r.progress_eval === 'Trễ hạn') e.late++;
        if (r.task_detail) e.tasks.add(r.task_detail);
      });

      // Convert employee map
      const employees = Object.values(employeeMap).map(e => ({
        ...e,
        tasks: [...e.tasks],
        completionRate: e.planScreens > 0 ? Math.round((e.actualScreens / e.planScreens) * 100) : (e.totalReports > 0 ? 100 : 0)
      })).sort((a, b) => b.actualScreens - a.actualScreens);

      return {
        stats: {
          totalReports: reports.length,
          totalMembers: [...new Set(reports.map(r => r.user_id))].length,
          totalPlanScreens, totalActScreens,
          totalPlanLocs, totalActLocs,
          completed, inProgress, needHelp, late,
          overallCompletion: totalPlanScreens > 0 ? Math.round((totalActScreens / totalPlanScreens) * 100) : 0,
          employees
        },
        reports,
        error: null
      };
    },

    async create(reportData) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('reports')
          .insert(reportData)
          .select()
          .single();
        return { data, error };
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          mockReports = getMockData('bctd_mock_reports', DEFAULT_MOCK_REPORTS);
          const newReport = {
            id: 'mock-rep-' + Math.random().toString(36).substr(2, 9),
            created_at: new Date().toISOString(),
            ...reportData
          };
          
          // Append employee name and position from mock user list
          const creator = mockUsers.find(u => u.id === reportData.user_id);
          newReport.employee_name = creator ? creator.full_name : 'Nhân viên';
          newReport.role_name = creator ? creator.position : 'Kỹ thuật';

          mockReports.push(newReport);
          setMockData('bctd_mock_reports', mockReports);
          resolve({ data: newReport, error: null });
        });
      }
    },

    async update(id, reportData) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('reports')
          .update(reportData)
          .eq('id', id)
          .select()
          .single();
        return { data, error };
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          mockReports = getMockData('bctd_mock_reports', DEFAULT_MOCK_REPORTS);
          const idx = mockReports.findIndex(r => r.id === id);
          if (idx === -1) {
            resolve({ data: null, error: new Error('Không tìm thấy báo cáo!') });
            return;
          }
          mockReports[idx] = {
            ...mockReports[idx],
            ...reportData
          };
          setMockData('bctd_mock_reports', mockReports);
          resolve({ data: mockReports[idx], error: null });
        });
      }
    },

    async delete(id) {
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('reports')
          .delete()
          .eq('id', id);
        return { error };
      } else {
        // Mock Implementation
        return new Promise((resolve) => {
          mockReports = getMockData('bctd_mock_reports', DEFAULT_MOCK_REPORTS);
          mockReports = mockReports.filter(r => r.id !== id);
          setMockData('bctd_mock_reports', mockReports);
          resolve({ error: null });
        });
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Assignments API (Số lượng phụ trách theo hạng mục của từng nhân viên)
  // ═══════════════════════════════════════════════════════════════════════════
  assignments: {
    /** Get assignments of one employee. */
    async getByUser(userId) {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('assignments')
          .select('*')
          .eq('user_id', userId);
        return { data: data || [], error };
      } else {
        return new Promise((resolve) => {
          const all = getMockData('bctd_mock_assignments', []);
          resolve({ data: all.filter(a => a.user_id === userId), error: null });
        });
      }
    },

    /** Get all assignments (admin) with employee names attached. */
    async getAll() {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase.from('assignments').select('*');
        if (error) return { data: [], error };
        const userIds = [...new Set((data || []).map(a => a.user_id))];
        let profileMap = {};
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from('profiles')
            .select('id, full_name, position')
            .in('id', userIds);
          (profs || []).forEach(p => { profileMap[p.id] = p; });
        }
        const mapped = (data || []).map(a => ({
          ...a,
          employee_name: profileMap[a.user_id]?.full_name || 'Nhân viên',
          role_name: profileMap[a.user_id]?.position || ''
        }));
        return { data: mapped, error: null };
      } else {
        return new Promise((resolve) => {
          const all = getMockData('bctd_mock_assignments', []);
          mockUsers = getMockData('bctd_mock_users', DEFAULT_MOCK_USERS);
          const mapped = all.map(a => {
            const u = mockUsers.find(x => x.id === a.user_id);
            return { ...a, employee_name: u?.full_name || 'Nhân viên', role_name: u?.position || '' };
          });
          resolve({ data: mapped, error: null });
        });
      }
    },

    /**
     * Upsert (create or update) one employee's assignment.
     * @param {string} channel - Kênh hệ thống Golden (UNI/CF/SALON/BUILDING/FF/MALL) hoặc 'ALL' nếu khai chung.
     */
    async upsert(userId, category, values, channel = 'ALL') {
      const row = {
        user_id: userId,
        category,
        channel,
        locations: values.locations !== '' && values.locations != null ? parseInt(values.locations) : 0,
        screens: values.screens !== '' && values.screens != null ? parseInt(values.screens) : 0,
        done_locations: values.done_locations !== '' && values.done_locations != null ? parseInt(values.done_locations) : 0,
        done_screens: values.done_screens !== '' && values.done_screens != null ? parseInt(values.done_screens) : 0
      };
      // Đánh dấu "tuần" của số đã hoàn thành — chỉ ghi khi được truyền vào, để không vô tình xoá dấu tuần cũ
      if (values.week !== undefined && values.week !== null && values.week !== '') {
        row.done_week = parseInt(values.week) || null;
      }
      if (isSupabaseConfigured) {
        const { error } = await supabase
          .from('assignments')
          .upsert(row, { onConflict: 'user_id,category,channel' });
        return { error };
      } else {
        return new Promise((resolve) => {
          let all = getMockData('bctd_mock_assignments', []);
          const idx = all.findIndex(a =>
            a.user_id === userId && a.category === category && (a.channel || 'ALL') === channel
          );
          if (idx !== -1) {
            all[idx] = { ...all[idx], ...row };
          } else {
            all.push({ id: 'mock-asg-' + Math.random().toString(36).substr(2, 9), ...row });
          }
          setMockData('bctd_mock_assignments', all);
          resolve({ error: null });
        });
      }
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // Settings API (Categories & Dynamic Fields)
  // ═══════════════════════════════════════════════════════════════════════════
  settings: {
    async get() {
      if (isSupabaseConfigured) {
        try {
          const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('id', 1)
            .single();
          if (error && error.code !== 'PGRST116') throw error; // Ignore not found
          if (!data) return { data: DEFAULT_SETTINGS, error: null };
          return {
            data: {
              categories: data.categories,
              fields: data.fields,
              weekStartDay: data.week_start_day ?? DEFAULT_SETTINGS.weekStartDay,
              channels: (data.channels && data.channels.length > 0) ? data.channels : DEFAULT_SETTINGS.channels,
              weeklyTemplate: data.weekly_template ?? DEFAULT_SETTINGS.weeklyTemplate,
              categoryTypes: data.category_types ?? DEFAULT_SETTINGS.categoryTypes
            },
            error: null
          };
        } catch (error) {
          console.error("Error fetching settings from Supabase:", error);
          return { data: DEFAULT_SETTINGS, error };
        }
      } else {
        return new Promise((resolve) => {
          mockSettings = getMockData('bctd_mock_settings', DEFAULT_SETTINGS);
          if (mockSettings.weekStartDay === undefined) mockSettings.weekStartDay = DEFAULT_SETTINGS.weekStartDay;
          if (!mockSettings.channels || mockSettings.channels.length === 0) mockSettings.channels = DEFAULT_SETTINGS.channels;
          if (!mockSettings.weeklyTemplate) mockSettings.weeklyTemplate = DEFAULT_SETTINGS.weeklyTemplate;
          if (!mockSettings.categoryTypes) mockSettings.categoryTypes = DEFAULT_SETTINGS.categoryTypes;
          resolve({ data: mockSettings, error: null });
        });
      }
    },
    async update(newSettings) {
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('settings')
            .upsert({
              id: 1,
              categories: newSettings.categories,
              fields: newSettings.fields,
              week_start_day: newSettings.weekStartDay ?? DEFAULT_SETTINGS.weekStartDay,
              channels: newSettings.channels ?? DEFAULT_SETTINGS.channels,
              weekly_template: newSettings.weeklyTemplate ?? DEFAULT_SETTINGS.weeklyTemplate,
              category_types: newSettings.categoryTypes ?? DEFAULT_SETTINGS.categoryTypes
            });
          return { error };
        } catch (error) {
          console.error("Error updating settings in Supabase:", error);
          return { error };
        }
      } else {
        return new Promise((resolve) => {
          mockSettings = newSettings;
          setMockData('bctd_mock_settings', mockSettings);
          resolve({ error: null });
        });
      }
    }
  }
};
