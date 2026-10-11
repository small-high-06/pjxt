<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="title">OW评卷系统</h1>
      <p class="subtitle">广东讯飞启明科技 - 评卷系统复现</p>

      <!-- 角色选择 -->
      <div class="mode-select">
        <el-radio-group v-model="mode" size="large">
          <el-radio-button label="scan">扫描模式</el-radio-button>
          <el-radio-button label="grade">评卷模式</el-radio-button>
        </el-radio-group>
      </div>

      <!-- 登录表单 -->
      <el-form :model="loginForm" @submit.prevent="handleLogin" class="login-form">
        <el-form-item>
          <el-input
            v-model="loginForm.accountId"
            placeholder="请输入账号"
            size="large"
            prefix-icon="User"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            :loading="loading"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 快速登录提示 -->
      <el-collapse class="quick-login">
        <el-collapse-item title="快速登录账号（点击查看）">
          <el-table :data="quickAccounts" size="small" border>
            <el-table-column prop="id" label="账号" width="100" />
            <el-table-column prop="password" label="密码" width="80" />
            <el-table-column prop="role" label="角色" />
            <el-table-column prop="desc" label="说明" />
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </div>
  </div>
</template>

<script>
import { ElMessageBox } from 'element-plus'
import { authApi } from '../api'

export default {
  name: 'Login',
  data() {
    return {
      mode: 'grade',
      loginForm: {
        accountId: '',
        password: ''
      },
      loading: false,
      quickAccounts: [
        { id: '001', password: '123', role: '管理员', desc: '最高权限' },
        { id: '002', password: '123', role: '管理员', desc: '最高权限' },
        { id: '101', password: '123', role: '科组长', desc: '语文科组长' },
        { id: '201', password: '123', role: '科组长', desc: '数学科组长' },
        { id: '301', password: '123', role: '科组长', desc: '英语科组长' },
        { id: '10101', password: '123', role: '题组长', desc: '语文第1题题组长' },
        { id: '1010101', password: '123', role: '评卷员', desc: '语文第1题评卷员1' },
        { id: '1010102', password: '123', role: '评卷员', desc: '语文第1题评卷员2' }
      ]
    }
  },
  methods: {
    async handleLogin() {
      if (!this.loginForm.accountId || !this.loginForm.password) {
        this.$message.warning('请输入账号和密码')
        return
      }
      await this.doLogin(false)
    },
    async doLogin(force) {
      this.loading = true
      try {
        const res = await authApi.login({
          accountId: this.loginForm.accountId,
          password: this.loginForm.password,
          mode: this.mode,
          force
        })
        const user = res.data.user
        user.mode = this.mode
        user.token = res.data.token
        sessionStorage.setItem('currentUser', JSON.stringify(user))

        // 所有账号进入桌面式主页, 从桌面图标进入对应功能
        this.$router.push('/app/desktop')
        this.$message.success(`欢迎，${user.name}`)
      } catch (err) {
        const data = err.response?.data
        // 账号显示已登入但可能只是残留会话 (未正常退出), 允许强制接管
        if (err.response?.status === 403 && data?.occupied && !force) {
          try {
            await ElMessageBox.confirm(
              `${data.error}。若当前没有其他设备使用该账号（如浏览器未正常退出导致的残留会话），可强制登入，旧会话将自动失效。`,
              '账号已被占用',
              { confirmButtonText: '强制登入', cancelButtonText: '取消', type: 'warning' }
            )
            await this.doLogin(true)
          } catch (e) {
            // 用户取消
          }
        } else {
          this.$message.error(data?.error || '登录失败')
        }
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.login-box {
  background: #fff;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  width: 450px;
  max-width: 90vw;
}
.title {
  text-align: center;
  color: #303133;
  font-size: 28px;
  margin-bottom: 8px;
}
.subtitle {
  text-align: center;
  color: #909399;
  font-size: 14px;
  margin-bottom: 30px;
}
.mode-select {
  text-align: center;
  margin-bottom: 24px;
}
.login-form {
  margin-bottom: 20px;
}
.quick-login {
  border-top: 1px solid #ebeef5;
  padding-top: 16px;
}
</style>
