import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// 认证
export const authApi = {
  login: (data) => api.post('/login', data),
  logout: (token) => api.post('/logout', { token }),
  getUser: (id) => api.get(`/user/${id}`),
  getSession: (accountId) => api.get(`/session/${accountId}`)
}

// 科目
export const subjectApi = {
  getAll: () => api.get('/subjects'),
  getQuestions: (subjectId) => api.get('/questions', { params: { subjectId } }),
  getAllQuestions: () => api.get('/questions'),
  getStudents: () => api.get('/students'),
  addStudent: (data) => api.post('/students', data)
}

// 扫描
export const scanApi = {
  upload: (formData) => api.post('/scan/upload', formData),
  getList: (params) => api.get('/scans', { params }),
  getFlagged: () => api.get('/scan/flagged')
}

// 评卷
export const gradeApi = {
  getTasks: (graderId) => api.get(`/grade/tasks/${graderId}`),
  getTask: (scanId) => api.get(`/grade/task/${scanId}`),
  submit: (data) => api.post('/grade/submit', data),
  flag: (data) => api.post('/grade/flag', data),
  getFlagged: (leaderId) => api.get(`/grade/flagged/${leaderId}`),
  getAssignment: (leaderId) => api.get(`/grade/assignment/${leaderId}`),
  getArbitration: (leaderId) => api.get(`/grade/arbitration/${leaderId}`),
  submitArbitration: (data) => api.post('/grade/arbitration/submit', data)
}

// 进度
export const progressApi = {
  getSubjectProgress: (subjectId) => api.get(`/progress/subject/${subjectId}`),
  getAllSubjectProgress: () => api.get('/progress/subjects'),
  getQuestionProgress: (questionId) => api.get(`/progress/question/${questionId}`)
}

// 组员对比
export const comparisonApi = {
  getWorkload: (params) => api.get('/comparison/workload', { params }),
  getScoreDistribution: (params) => api.get('/comparison/score-distribution', { params })
}

// 抽查
export const samplingApi = {
  getList: (params) => api.get('/sampling/list', { params })
}

// 个人资料
export const profileApi = {
  get: (id, viewerId) => api.get(`/profile/${id}`, { params: { viewerId } }),
  update: (id, data) => api.put(`/profile/${id}`, data)
}

// 账号管理
export const accountApi = {
  getAll: (params) => api.get('/accounts', { params }),
  addGrader: (data) => api.post('/accounts/grader', data),
  delete: (id, requesterId) => api.delete(`/accounts/${id}`, { params: { requesterId } })
}

export default api
