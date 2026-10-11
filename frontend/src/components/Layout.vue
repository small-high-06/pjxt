<template>
  <el-container class="layout-container">
    <!-- 经典标题栏 -->
    <el-header class="titlebar" height="36px">
      <div class="titlebar-title">{{ systemTitle }}</div>
      <div class="titlebar-right">
        版本: 1.0.0&nbsp;&nbsp;|&nbsp;&nbsp;已登录: {{ user.name }}
      </div>
    </el-header>

    <el-container class="layout-body">
      <!-- 侧边栏 -->
      <el-aside width="200px" class="sidebar">
        <el-menu
          :default-active="activeMenu"
          router
          background-color="transparent"
          text-color="#1a4f8b"
          active-text-color="#0b4f8f"
          class="menu-classic"
        >
          <div class="menu-group-title">系统</div>
          <el-menu-item index="/app/desktop">
            <el-icon><HomeFilled /></el-icon>
            <template #title>返回主页</template>
          </el-menu-item>
          <div class="menu-item-plain" @click="openProfile">
            <el-icon><User /></el-icon>
            <span>个人资料</span>
          </div>
          <div class="menu-item-plain" @click="logout">
            <el-icon><SwitchButton /></el-icon>
            <span>退出登录</span>
          </div>

          <!-- 扫描模式 -->
          <template v-if="user.mode === 'scan'">
            <div class="menu-group-title">扫描</div>
            <el-menu-item index="/app/scan">
              <el-icon><Upload /></el-icon>
              <template #title>扫描上传</template>
            </el-menu-item>
          </template>

          <!-- 评卷模式根据权限显示菜单 -->
          <template v-if="user.mode === 'grade'">
            <div class="menu-group-title">评卷</div>
            <!-- 正常评卷 (所有角色) -->
            <el-menu-item index="/app/grade">
              <el-icon><EditPen /></el-icon>
              <template #title>正常评卷</template>
            </el-menu-item>

            <!-- 科目进度 (管理员, 科组长) -->
            <el-menu-item v-if="user.level <= 1" index="/app/subject-progress">
              <el-icon><DataLine /></el-icon>
              <template #title>科目进度</template>
            </el-menu-item>

            <!-- 题目进度 (题组长) -->
            <el-menu-item v-if="user.level === 2" index="/app/question-progress">
              <el-icon><DataAnalysis /></el-icon>
              <template #title>题目进度</template>
            </el-menu-item>

            <!-- 组员对比 (管理员, 科组长, 题组长) -->
            <el-menu-item v-if="user.level <= 2" index="/app/member-comparison">
              <el-icon><UserFilled /></el-icon>
              <template #title>组员对比</template>
            </el-menu-item>

            <!-- 抽查试卷 (管理员, 科组长, 题组长) -->
            <el-menu-item v-if="user.level <= 2" index="/app/sampling">
              <el-icon><Document /></el-icon>
              <template #title>抽查试卷</template>
            </el-menu-item>

            <!-- 账号管理 (管理员, 科组长) -->
            <el-menu-item v-if="user.level <= 1" index="/app/accounts">
              <el-icon><Setting /></el-icon>
              <template #title>账号管理</template>
            </el-menu-item>
          </template>
        </el-menu>
      </el-aside>

      <!-- 主内容区 -->
      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>

    <!-- 经典状态栏: 左下角显示个人信息 -->
    <el-footer class="statusbar" height="30px">
      <span>用户姓名: {{ user.name }}</span>
      <span>代号: {{ user.id }}</span>
      <span>登录帐号: {{ user.id }}</span>
      <span>身份: {{ identityText }}</span>
    </el-footer>

    <!-- 个人资料弹窗 -->
    <el-dialog v-model="profileVisible" title="个人资料" width="460px">
      <el-form :model="profileForm" label-width="90px">
        <el-form-item label="姓名">
          <el-input v-model="profileForm.name" placeholder="请输入姓名" />
        </el-form-item>
        <el-form-item label="身份证">
          <el-input v-model="profileForm.idCard" placeholder="请输入身份证号" />
        </el-form-item>
        <el-form-item label="电话号码">
          <el-input v-model="profileForm.phone" placeholder="请输入电话号码" />
        </el-form-item>
        <el-form-item label="所在学校">
          <el-input v-model="profileForm.school" placeholder="请输入所在学校" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profileVisible = false">取消</el-button>
        <el-button type="primary" :loading="profileSaving" @click="saveProfile">保存</el-button>
      </template>
    </el-dialog>
  </el-container>
</template>

<script>
import { Upload, EditPen, DataLine, DataAnalysis, UserFilled, Document, Setting, HomeFilled, SwitchButton, User } from '@element-plus/icons-vue'
import { authApi, subjectApi, profileApi } from '../api'

export default {
  name: 'Layout',
  components: { Upload, EditPen, DataLine, DataAnalysis, UserFilled, Document, Setting, HomeFilled, SwitchButton, User },
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      subjectName: '',
      heartbeatTimer: null,
      profileVisible: false,
      profileSaving: false,
      profileForm: { name: '', idCard: '', phone: '', school: '' }
    }
  },
  computed: {
    activeMenu() {
      return this.$route.path
    },
    systemTitle() {
      return this.user.mode === 'scan' ? 'OW评卷系统扫描端' : 'OW评卷系统评卷端'
    },
    roleText() {
      const roleMap = {
        admin: '管理员',
        subject_leader: '科组长',
        question_leader: '题组长',
        grader: '评卷员'
      }
      return roleMap[this.user.role] || '评卷员'
    },
    identityText() {
      if (this.user.mode === 'scan') return '扫描员'
      if (this.user.role === 'admin') return '管理员'
      const subject = this.subjectName || ''
      if (this.user.role === 'subject_leader') return `${subject}科组长`
      if (this.user.role === 'question_leader') return `${subject}第${this.user.questionIndex}题 题组长`
      return `${subject}第${this.user.questionIndex}题 评卷员`
    }
  },
  async mounted() {
    // 状态栏身份需要科目名称
    if (this.user.subjectId) {
      try {
        const res = await subjectApi.getAll()
        const subject = res.data.find(s => s.id === this.user.subjectId)
        this.subjectName = subject ? subject.name : ''
      } catch (e) { /* 忽略 */ }
    }
    // 定期心跳, 保持会话活跃; 停止心跳超 2 分钟的会话在登录时会被自动释放
    this.heartbeatTimer = setInterval(() => this.heartbeat(), 30 * 1000)
  },
  beforeUnmount() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
  },
  methods: {
    async heartbeat() {
      if (!this.user.id) return
      try {
        await authApi.getSession(this.user.id)
      } catch (e) {
        // 会话可能已失效, 忽略
      }
    },
    async logout() {
      // 调用后端清理会话
      try {
        if (this.user.token) {
          await authApi.logout(this.user.token)
        }
      } catch (e) {
        // 忽略后端错误
      }
      sessionStorage.removeItem('currentUser')
      this.$router.push('/')
      this.$message.success('已退出登录，可重新登入')
    },
    async openProfile() {
      try {
        const res = await profileApi.get(this.user.id)
        this.profileForm = {
          name: res.data.name || '',
          idCard: res.data.idCard || '',
          phone: res.data.phone || '',
          school: res.data.school || ''
        }
      } catch (e) {
        // 加载失败时用当前登录信息兜底
        this.profileForm = { name: this.user.name || '', idCard: '', phone: '', school: '' }
      }
      this.profileVisible = true
    },
    async saveProfile() {
      this.profileSaving = true
      try {
        const res = await profileApi.update(this.user.id, this.profileForm)
        this.$message.success('个人资料保存成功')
        this.profileVisible = false
        // 同步更新本地登录用户姓名
        if (res.data.name && res.data.name !== this.user.name) {
          this.user.name = res.data.name
          sessionStorage.setItem('currentUser', JSON.stringify(this.user))
        }
      } catch (e) {
        this.$message.error('保存失败')
      } finally {
        this.profileSaving = false
      }
    }
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.layout-body {
  overflow: hidden;
}
/* ===== 经典标题栏 ===== */
.titlebar {
  background: linear-gradient(180deg, #2e6da8, #1a4f8b);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid #0d3a6b;
}
.titlebar-title {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1px;
}
.titlebar-right {
  font-size: 12px;
  opacity: 0.9;
}
/* ===== 经典状态栏 ===== */
.statusbar {
  background: #e8eef7;
  border-top: 1px solid #b8c4d6;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 14px;
  font-size: 12px;
  color: #333;
}
/* ===== 经典侧边栏 ===== */
.sidebar {
  background: linear-gradient(180deg, #eaf0f8, #d3dfef);
  border-right: 1px solid #b8c4d6;
  overflow-y: auto;
}
.menu-classic {
  border-right: none;
  padding: 4px 0;
}
.menu-group-title {
  padding: 10px 16px 4px;
  font-size: 12px;
  font-weight: bold;
  color: #1a4f8b;
}
.menu-classic :deep(.el-menu-item) {
  height: 38px;
  line-height: 38px;
  margin: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
}
.menu-classic :deep(.el-menu-item:hover) {
  background: rgba(64, 158, 255, 0.12);
}
.menu-classic :deep(.el-menu-item.is-active) {
  background: rgba(64, 158, 255, 0.22);
  font-weight: bold;
}
.menu-item-plain {
  height: 38px;
  line-height: 38px;
  margin: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  color: #1a4f8b;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.menu-item-plain:hover {
  background: rgba(64, 158, 255, 0.12);
}
/* ===== 经典主区: 蓝色桌面背景 ===== */
.main-content {
  background: radial-gradient(circle at 28% 18%, #3a86c8, #1a5fa8 45%, #0b4f8f 100%);
  padding: 16px;
  overflow-y: auto;
}
</style>
