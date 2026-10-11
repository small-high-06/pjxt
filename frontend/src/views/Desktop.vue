<template>
  <div class="desktop-page">
    <div class="desktop-icons">
      <div
        v-for="item in icons"
        :key="item.path"
        class="desktop-icon"
        @click="$router.push(item.path)"
      >
        <div class="icon-box">
          <el-icon :size="34" color="#fff">
            <component :is="iconMap[item.icon]" />
          </el-icon>
        </div>
        <span class="icon-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import { EditPen, DataLine, DataAnalysis, UserFilled, Document, Setting, Upload } from '@element-plus/icons-vue'

export default {
  name: 'Desktop',
  components: { EditPen, DataLine, DataAnalysis, UserFilled, Document, Setting, Upload },
  data() {
    return {
      iconMap: { EditPen, DataLine, DataAnalysis, UserFilled, Document, Setting, Upload },
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}')
    }
  },
  computed: {
    // 桌面图标按角色权限动态生成
    icons() {
      if (this.user.mode === 'scan') {
        return [{ label: '扫描上传', path: '/app/scan', icon: 'Upload' }]
      }
      const list = [{ label: '正常评卷', path: '/app/grade', icon: 'EditPen' }]
      if (this.user.level <= 1) {
        list.push({ label: '科目进度', path: '/app/subject-progress', icon: 'DataLine' })
      }
      if (this.user.level === 2) {
        list.push({ label: '题目进度', path: '/app/question-progress', icon: 'DataAnalysis' })
      }
      if (this.user.level <= 2) {
        list.push({ label: '组员对比', path: '/app/member-comparison', icon: 'UserFilled' })
        list.push({ label: '抽查试卷', path: '/app/sampling', icon: 'Document' })
      }
      if (this.user.level <= 1) {
        list.push({ label: '账号管理', path: '/app/accounts', icon: 'Setting' })
      }
      return list
    }
  }
}
</script>

<style scoped>
.desktop-page {
  padding-top: 48px;
}
.desktop-icons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 48px;
  max-width: 900px;
  margin: 0 auto;
}
.desktop-icon {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  user-select: none;
}
.icon-box {
  width: 68px;
  height: 68px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #5aa7e8, #1a5fa8);
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 4px 12px rgba(0, 21, 41, 0.45);
  transition: transform 0.15s;
}
.desktop-icon:hover .icon-box {
  transform: translateY(-3px);
  background: linear-gradient(145deg, #7dbcff, #2a7fd4);
}
.icon-label {
  margin-top: 10px;
  color: #fff;
  font-size: 14px;
  text-shadow: 0 1px 3px rgba(0, 21, 41, 0.8);
}
</style>
