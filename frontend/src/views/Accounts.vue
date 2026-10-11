<template>
  <div class="accounts-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>
            账号管理
            <el-tag v-if="isSubjectLeader" type="warning" size="small" style="margin-left: 8px">
              科组长仅可管理本科目 ({{ userSubjectName }}) 账号
            </el-tag>
          </span>
          <div class="header-right">
            <el-select v-model="filterRole" placeholder="角色筛选" clearable style="width: 150px" @change="loadAccounts">
              <el-option label="全部" value="" />
              <el-option label="管理员" value="admin" />
              <el-option label="科组长" value="subject_leader" />
              <el-option label="题组长" value="question_leader" />
              <el-option label="评卷员" value="grader" />
            </el-select>
            <el-button type="primary" @click="showAddDialog">添加评卷员</el-button>
          </div>
        </div>
      </template>

      <el-table :data="accounts" border style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="账号" width="120" />
        <el-table-column prop="name" label="姓名" width="150" />
        <el-table-column prop="password" label="密码" width="80" />
        <el-table-column label="角色" width="100">
          <template #default="{ row }">
            <el-tag :type="roleTagType(row.role)">{{ roleText(row.role) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="level" label="权限等级" width="100">
          <template #default="{ row }">等级{{ row.level }}</template>
        </el-table-column>
        <el-table-column prop="subjectName" label="所属科目" width="100" />
        <el-table-column prop="questionName" label="所属题目" width="150" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button
              v-if="row.role === 'grader' || row.role === 'question_leader'"
              size="small"
              @click="viewProfile(row)"
            >
              查看资料
            </el-button>
            <el-button
              v-if="row.role === 'grader' && canManage(row)"
              type="danger"
              size="small"
              @click="deleteAccount(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 账号规律说明 -->
      <el-card shadow="never" style="margin-top: 20px">
        <template #header>账号规律说明</template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="管理员">001, 002 (最高权限)</el-descriptions-item>
          <el-descriptions-item label="科组长">101(语文), 201(数学), 301(英语)</el-descriptions-item>
          <el-descriptions-item label="题组长">A0B01 (A=科目1/2/3, B=题号, 如10101=语文第1题)</el-descriptions-item>
          <el-descriptions-item label="评卷员">A010B0C (A=科目, B=题号, C=评卷员序号)</el-descriptions-item>
        </el-descriptions>
      </el-card>
    </el-card>

    <!-- 添加评卷员弹窗 -->
    <el-dialog v-model="addDialogVisible" title="添加评卷员" width="500px">
      <el-form :model="addForm" label-width="100px">
        <el-form-item label="选择题目">
          <el-select v-model="addForm.questionId" placeholder="请选择题组长" filterable style="width: 100%">
            <el-option
              v-for="q in questionLeaderQuestions"
              :key="q.id"
              :label="`${q.name} (满分${q.maxScore})`"
              :value="q.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-alert title="系统将自动生成评卷员账号" type="info" :closable="false" show-icon>
            账号规律: A010B0C, 密码默认: 123
          </el-alert>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="addGrader" :loading="adding">添加</el-button>
      </template>
    </el-dialog>

    <!-- 身份资料查看弹窗 -->
    <el-dialog v-model="profileVisible" title="身份资料" width="460px">
      <el-descriptions v-if="profileData" :column="1" border>
        <el-descriptions-item label="姓名">{{ profileData.name }}</el-descriptions-item>
        <el-descriptions-item label="电话号码">{{ profileData.phone || '未填写' }}</el-descriptions-item>
        <template v-if="!profileData.limited">
          <el-descriptions-item label="身份证">{{ profileData.idCard || '未填写' }}</el-descriptions-item>
          <el-descriptions-item label="所在学校">{{ profileData.school || '未填写' }}</el-descriptions-item>
        </template>
      </el-descriptions>
    </el-dialog>
  </div>
</template>

<script>
import { accountApi, subjectApi, profileApi } from '../api'

export default {
  name: 'Accounts',
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      accounts: [],
      loading: false,
      filterRole: '',
      questions: [],
      subjects: [],
      profileVisible: false,
      profileData: null,
      addDialogVisible: false,
      addForm: { questionId: '' },
      adding: false
    }
  },
  computed: {
    // 科组长只能管理自己科目下的题目
    questionLeaderQuestions() {
      if (this.user.role === 'subject_leader' && this.user.subjectId) {
        return this.questions.filter(q => q.subjectId === this.user.subjectId)
      }
      return this.questions
    },
    isSubjectLeader() {
      return this.user.role === 'subject_leader'
    },
    userSubjectName() {
      const s = this.subjects.find(s => s.id === this.user.subjectId)
      return s ? s.name : ''
    }
  },
  async mounted() {
    const [questionsRes, subjectsRes] = await Promise.all([
      subjectApi.getAllQuestions(),
      subjectApi.getAll()
    ])
    this.questions = questionsRes.data
    this.subjects = subjectsRes.data
    await this.loadAccounts()
  },
  methods: {
    canManage(row) {
      // 管理员可管理全部账号; 科组长只能管理本科目的账号
      if (this.user.role === 'admin') return true
      if (this.user.role === 'subject_leader') return row.subjectId === this.user.subjectId
      return false
    },
    async viewProfile(row) {
      try {
        const res = await profileApi.get(row.id, this.user.id)
        this.profileData = res.data
        this.profileVisible = true
      } catch (err) {
        this.$message.error(err.response?.data?.error || '查看资料失败')
      }
    },
    async loadAccounts() {
      this.loading = true
      try {
        const params = { requesterId: this.user.id }
        if (this.filterRole) params.role = this.filterRole
        const res = await accountApi.getAll(params)
        this.accounts = res.data
      } catch (err) {
        this.$message.error('加载账号失败')
      } finally {
        this.loading = false
      }
    },
    roleText(role) {
      const map = {
        admin: '管理员',
        subject_leader: '科组长',
        question_leader: '题组长',
        grader: '评卷员'
      }
      return map[role] || role
    },
    roleTagType(role) {
      const map = {
        admin: 'danger',
        subject_leader: 'warning',
        question_leader: 'primary',
        grader: 'info'
      }
      return map[role] || 'info'
    },
    showAddDialog() {
      this.addForm = { questionId: '' }
      this.addDialogVisible = true
    },
    async addGrader() {
      if (!this.addForm.questionId) {
        this.$message.warning('请选择题目')
        return
      }
      this.adding = true
      try {
        const res = await accountApi.addGrader({ questionId: this.addForm.questionId, requesterId: this.user.id })
        this.$message.success(`评卷员添加成功，账号: ${res.data.id}`)
        this.addDialogVisible = false
        await this.loadAccounts()
      } catch (err) {
        this.$message.error(err.response?.data?.error || '添加失败')
      } finally {
        this.adding = false
      }
    },
    async deleteAccount(row) {
      try {
        await this.$confirm(`确认删除账号 ${row.id} (${row.name})?`, '提示', { type: 'warning' })
        await accountApi.delete(row.id, this.user.id)
        this.$message.success('删除成功')
        await this.loadAccounts()
      } catch (err) {
        if (err !== 'cancel') {
          this.$message.error(err.response?.data?.error || '删除失败')
        }
      }
    }
  }
}
</script>

<style scoped>
.accounts-page {
  max-width: 1200px;
  margin: 0 auto;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.header-right {
  display: flex;
  gap: 10px;
}
</style>
