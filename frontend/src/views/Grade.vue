<template>
  <div class="grade-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>正常评卷</span>
        </div>
      </template>

      <el-alert
        title="评卷说明"
        type="info"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #default>
          当前账号: {{ user.name }} | 负责科目: {{ subjectName }} | 负责题号: 第{{ user.questionIndex }}题
          <template v-if="user.role === 'question_leader'">
            <br />分差超过 10 分的仲裁试卷会出现在下方列表中，点击「仲裁评分」直接批改，您打的分数即为该试卷最终分数。
          </template>
        </template>
      </el-alert>

      <el-table :data="tasks" border style="width: 100%" v-loading="loading">
        <el-table-column prop="examNo" label="考号" width="120" />
        <el-table-column label="科目" width="80">
          <template #default>{{ subjectName }}</template>
        </el-table-column>
        <el-table-column prop="questionIndex" label="题号" width="80" />
        <el-table-column label="图片" width="100">
          <template #default="{ row }">
            <el-image
              :src="row.imagePath"
              :preview-src-list="[row.imagePath]"
              style="width: 60px; height: 60px"
              fit="cover"
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">{{ statusText(row.status) }}</el-tag>
            <el-tag v-if="isArbitration(row)" type="danger" style="margin-left: 4px">仲裁</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="仲裁原因" width="180">
          <template #default="{ row }">
            <span v-if="isArbitration(row)" style="color: #e6a23c">{{ row.arbitrationReason }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="评分情况" width="200">
          <template #default="{ row }">
            <div v-if="row.scores && row.scores.length > 0">
              <div v-for="s in row.scores" :key="s.id">
                {{ s.graderName }}: {{ s.score }}分 ({{ roundLabel(s.round) }})
              </div>
            </div>
            <span v-else>未评分</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              :type="isArbitration(row) ? 'danger' : 'primary'"
              size="small"
              @click="goGrade(row)"
            >
              {{ isArbitration(row) ? '仲裁评分' : (row.scores && row.scores.some(s => s.graderId === user.id) ? '修改评分' : '评卷') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { gradeApi, subjectApi } from '../api'

export default {
  name: 'Grade',
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      tasks: [],
      question: null,
      subjectName: '',
      loading: false
    }
  },
  async mounted() {
    await this.loadTasks()
  },
  methods: {
    async loadTasks() {
      this.loading = true
      try {
        const res = await gradeApi.getTasks(this.user.id)
        this.tasks = res.data.tasks
        this.question = res.data.question
        // 获取科目名称
        const subjectsRes = await subjectApi.getAll()
        const subject = subjectsRes.data.find(s => s.id === this.user.subjectId)
        this.subjectName = subject ? subject.name : this.user.subjectId
      } catch (err) {
        this.$message.error('加载任务失败')
      } finally {
        this.loading = false
      }
    },
    goGrade(task) {
      this.$router.push(`/app/grade/${task.id}`)
    },
    isArbitration(row) {
      return row.arbitration === true && !row.arbitrationResolved
    },
    roundLabel(round) {
      if (round === 1) return '一评'
      if (round === 99) return '仲裁'
      return '二评'
    },
    statusText(status) {
      const map = { pending: '待评', partial: '部分评', graded: '已评', arbitration: '仲裁中' }
      return map[status] || status
    },
    statusTagType(status) {
      const map = { pending: 'info', partial: 'warning', graded: 'success', arbitration: 'danger' }
      return map[status] || 'info'
    }
  }
}
</script>

<style scoped>
.grade-page {
  max-width: 1200px;
  margin: 0 auto;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
