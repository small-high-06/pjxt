<template>
  <div class="question-progress-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>题目进度</span>
          <el-select v-model="selectedQuestion" placeholder="选择题号" style="width: 250px" @change="loadData">
            <el-option
              v-for="q in questions"
              :key="q.id"
              :label="`${q.name} (满分${q.maxScore})`"
              :value="q.id"
            />
          </el-select>
        </div>
      </template>

      <div v-if="progress">
        <el-row :gutter="20">
          <el-col :span="6">
            <el-card shadow="never">
              <div class="stat-card">
                <div class="stat-label">总扫描数</div>
                <div class="stat-value">{{ progress.totalScans }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="never">
              <div class="stat-card">
                <div class="stat-label">已评数</div>
                <div class="stat-value" style="color: #67c23a">{{ progress.gradedScans }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="never">
              <div class="stat-card">
                <div class="stat-label">评中数</div>
                <div class="stat-value" style="color: #e6a23c">{{ progress.partialScans }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="6">
            <el-card shadow="never">
              <div class="stat-card">
                <div class="stat-label">待评数</div>
                <div class="stat-value" style="color: #f56c6c">{{ progress.pendingScans }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-card shadow="never" style="margin-top: 20px">
          <div class="progress-display">
            <span>评卷进度:</span>
            <el-progress
              :percentage="progress.percent"
              :stroke-width="24"
              :status="progress.percent === 100 ? 'success' : ''"
              style="flex: 1; margin-left: 16px"
            />
            <span style="margin-left: 16px; font-size: 20px; font-weight: bold">{{ progress.percent }}%</span>
          </div>
        </el-card>
      </div>
    </el-card>

    <!-- 试卷归属表 (题组长视图) -->
    <el-card v-if="user.role === 'question_leader' && assignment" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span>试卷归属 ({{ user.name }})</span>
          <el-button size="small" @click="loadAssignment">刷新</el-button>
        </div>
      </template>
      <el-table :data="assignment.scans" border style="width: 100%">
        <el-table-column prop="examNo" label="考号" width="120" />
        <el-table-column prop="studentName" label="学生" width="100" />
        <el-table-column label="图片" width="100">
          <template #default="{ row }">
            <el-image
              :src="row.imagePath"
              :preview-src-list="[row.imagePath]"
              style="width: 50px; height: 50px"
              fit="cover"
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退回原因" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.flagged" type="danger">{{ row.flagReason }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="评卷员归属(谁评过/手头)">
          <template #default="{ row }">
            <span v-if="row.holders.length === 0" style="color: #909399">尚未分配</span>
            <div v-else>
              <el-tag
                v-for="h in row.holders"
                :key="h.graderId + h.round"
                :type="h.round === 1 ? 'success' : (h.round === 2 ? 'warning' : 'danger')"
                style="margin: 2px"
              >
                {{ h.graderName }} ({{ roundLabel(h.round) }}): {{ h.score }}分
              </el-tag>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 退回试卷列表 (题组长视图) -->
    <el-card v-if="user.role === 'question_leader' && flaggedList" style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span>退回的试卷 ({{ flaggedList.flagged.length }} 份)</span>
          <el-button size="small" @click="loadFlagged">刷新</el-button>
        </div>
      </template>
      <el-table :data="flaggedList.flagged" border style="width: 100%">
        <el-table-column prop="examNo" label="考号" width="120" />
        <el-table-column label="图片" width="100">
          <template #default="{ row }">
            <el-image
              :src="row.imagePath"
              :preview-src-list="[row.imagePath]"
              style="width: 50px; height: 50px"
              fit="cover"
            />
          </template>
        </el-table-column>
        <el-table-column label="退回原因" width="120">
          <template #default="{ row }">
            <el-tag type="danger">{{ row.flagReasonText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="flaggedByName" label="退回人" width="160" />
        <el-table-column label="退回时间">
          <template #default="{ row }">
            {{ new Date(row.flaggedAt).toLocaleString() }}
          </template>
        </el-table-column>
      </el-table>
      <div v-if="flaggedList.flagged.length === 0" style="text-align: center; color: #909399; padding: 20px">
        暂无退回试卷
      </div>
    </el-card>

    <!-- 仲裁试卷提示 (题组长视图): 仲裁批改已移至「正常评卷」页面 -->
    <el-card v-if="user.role === 'question_leader' && arbitrationCount > 0" style="margin-top: 20px">
      <el-alert
        :title="`有 ${arbitrationCount} 份试卷待仲裁，请前往「正常评卷」页面批改，您打的分数将作为最终分数`"
        type="warning"
        :closable="false"
        show-icon
      />
    </el-card>
  </div>
</template>

<script>
import { progressApi, subjectApi, gradeApi } from '../api'

export default {
  name: 'QuestionProgress',
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      questions: [],
      selectedQuestion: '',
      progress: null,
      assignment: null,
      flaggedList: null,
      arbitrationCount: 0,
      scoreOptions: []
    }
  },
  computed: {
    visibleQuestions() {
      // 简单返回全部已过滤的题
      return this.questions
    }
  },
  async mounted() {
    const res = await subjectApi.getAllQuestions()
    let allQuestions = res.data

    // 权限过滤
    if (this.user.role === 'question_leader' && this.user.subjectId) {
      allQuestions = allQuestions.filter(q => q.id === this.user.questionId)
    } else if (this.user.role === 'subject_leader' && this.user.subjectId) {
      allQuestions = allQuestions.filter(q => q.subjectId === this.user.subjectId)
    }
    this.questions = allQuestions

    if (this.user.role === 'question_leader' && this.user.questionId) {
      this.selectedQuestion = this.user.questionId
      // 评分选项
      const q = allQuestions.find(q => q.id === this.user.questionId)
      if (q) this.scoreOptions = q.scoreOptions
    } else if (this.questions.length > 0) {
      this.selectedQuestion = this.questions[0].id
      this.scoreOptions = this.questions[0].scoreOptions
    }

    await this.loadData()
    if (this.user.role === 'question_leader') {
      await this.loadAssignment()
      await this.loadFlagged()
      await this.loadArbitrationCount()
    }
  },
  methods: {
    async loadData() {
      if (!this.selectedQuestion) return
      const res = await progressApi.getQuestionProgress(this.selectedQuestion)
      this.progress = res.data
    },
    async loadAssignment() {
      try {
        const res = await gradeApi.getAssignment(this.user.id)
        this.assignment = res.data
      } catch (err) {}
    },
    async loadFlagged() {
      try {
        const res = await gradeApi.getFlagged(this.user.id)
        this.flaggedList = res.data
      } catch (err) {}
    },
    async loadArbitrationCount() {
      try {
        const res = await gradeApi.getArbitration(this.user.id)
        this.arbitrationCount = (res.data.arbitration || []).length
      } catch (err) {}
    },
    roundLabel(round) {
      if (round === 1) return '一评'
      if (round === 99) return '仲裁'
      return '二评'
    },
    statusText(status) {
      const map = { pending: '待评', partial: '评中', graded: '已评完', flagged: '已退回', arbitration: '仲裁中' }
      return map[status] || status
    },
    statusType(status) {
      const map = { pending: 'info', partial: 'warning', graded: 'success', flagged: 'danger', arbitration: 'warning' }
      return map[status] || 'info'
    }
  }
}
</script>

<style scoped>
.question-progress-page {
  max-width: 1200px;
  margin: 0 auto;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stat-card {
  text-align: center;
  padding: 10px;
}
.stat-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}
.stat-value {
  font-size: 32px;
  font-weight: bold;
  color: #303133;
}
.progress-display {
  display: flex;
  align-items: center;
  padding: 20px;
}
</style>
