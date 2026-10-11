<template>
  <div class="grade-task-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <el-button text @click="goBack"><el-icon><ArrowLeft /></el-icon> 返回</el-button>
          <span>{{ isArbitration ? '仲裁评分 (题组长)' : '评卷打分' }}</span>
          <el-button v-if="!isArbitration" type="warning" plain @click="showFlagDialog">
            试卷不清楚
          </el-button>
        </div>
      </template>

      <el-alert
        v-if="isArbitration"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 16px"
      >
        <template #default>
          该试卷一评二评分差过大，进入仲裁环节。仲裁原因：{{ scan ? scan.arbitrationReason : '' }}。
          您（题组长）此次打的分数将作为该试卷的<b>最终分数</b>。
        </template>
      </el-alert>

      <div v-loading="loading">
        <el-row :gutter="20" v-if="scan">
          <el-col :span="14">
            <el-card shadow="never">
              <template #header>试卷图片</template>
              <div class="image-container">
                <el-image
                  :src="scan.imagePath"
                  :preview-src-list="[scan.imagePath]"
                  fit="contain"
                  style="max-width: 100%; max-height: 600px"
                />
              </div>
            </el-card>
          </el-col>

          <el-col :span="10">
            <el-card shadow="never">
              <template #header>评分信息</template>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="考号">{{ scan.examNo }}</el-descriptions-item>
                <el-descriptions-item label="学生姓名">{{ student ? student.name : '未知' }}</el-descriptions-item>
                <el-descriptions-item label="科目">{{ subjectName }}</el-descriptions-item>
                <el-descriptions-item label="题号">第{{ scan.questionIndex }}题</el-descriptions-item>
                <el-descriptions-item label="题目名称">{{ question ? question.name : '未知' }}</el-descriptions-item>
                <el-descriptions-item label="满分">{{ question ? question.maxScore : 0 }}分</el-descriptions-item>
                <el-descriptions-item label="评次">{{ question ? (question.rounds === 1 ? '一评' : '二评') : '' }}</el-descriptions-item>
                <el-descriptions-item label="本次评次">
                  <el-tag type="primary">{{ currentRoundLabel }}</el-tag>
                </el-descriptions-item>
              </el-descriptions>

              <!-- 已有评分 -->
              <div v-if="existingScores.length > 0" style="margin-top: 16px">
                <h4>已有评分记录</h4>
                <div v-for="s in existingScores" :key="s.id" style="margin-bottom: 8px">
                  <el-tag type="success">
                    {{ s.graderName }}: {{ s.score }}分 ({{ roundLabel(s.round) }})
                  </el-tag>
                </div>
              </div>

              <!-- 评分 -->
              <div style="margin-top: 24px">
                <h4>请打分</h4>
                <el-radio-group v-model="selectedScore" size="large">
                  <el-radio-button
                    v-for="opt in (question ? question.scoreOptions : [])"
                    :key="opt"
                    :label="opt"
                  >
                    {{ opt }}分
                  </el-radio-button>
                </el-radio-group>
              </div>

              <div style="margin-top: 24px; text-align: center">
                <el-button type="primary" size="large" @click="confirmSubmit" :loading="submitting">
                  提交评分
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 底部统计 -->
        <div class="stats-footer" v-if="sessionStats">
          <el-card shadow="never">
            <el-row>
              <el-col :span="12" class="stat-item">
                <div class="stat-label">本次登入已评卷数</div>
                <div class="stat-value">{{ sessionStats.gradedCount }} 份</div>
              </el-col>
              <el-col :span="12" class="stat-item">
                <div class="stat-label">在线时间</div>
                <div class="stat-value">{{ formatDuration(sessionStats.onlineSeconds) }}</div>
              </el-col>
            </el-row>
            <div class="stat-tip">注：统计从本次登入账号开始计算，下次登入重新计数</div>
          </el-card>
        </div>
      </div>
    </el-card>

    <!-- 提交评分确认弹窗 -->
    <el-dialog v-model="confirmVisible" title="确认提交评分" width="400px">
      <div style="text-align: center; padding: 10px 0">
        <p style="font-size: 16px; margin-bottom: 16px">确认提交以下评分？</p>
        <el-tag type="success" size="large" style="font-size: 18px; padding: 12px 24px">
          {{ selectedScore }} 分
        </el-tag>
        <p style="margin-top: 16px; color: #909399">
          提交后将自动进入下一题
        </p>
      </div>
      <template #footer>
        <el-button @click="confirmVisible = false">取消</el-button>
        <el-button type="primary" @click="doSubmit" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 试卷不清楚弹窗 -->
    <el-dialog v-model="flagVisible" title="试卷不清楚" width="400px">
      <div style="text-align: center; padding: 10px 0">
        <p style="margin-bottom: 20px">请选择试卷不清楚的原因：</p>
        <el-button type="warning" size="large" style="margin: 0 8px" @click="doFlag('blur')">
          模糊
        </el-button>
        <el-button type="danger" size="large" style="margin: 0 8px" @click="doFlag('wrong')">
          错误
        </el-button>
      </div>
      <div style="margin-top: 16px; color: #909399; font-size: 13px">
        提交后该试卷将退回到题组长处处理
      </div>
      <template #footer>
        <el-button @click="flagVisible = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ArrowLeft } from '@element-plus/icons-vue'
import { gradeApi, subjectApi, authApi } from '../api'

export default {
  name: 'GradeTask',
  components: { ArrowLeft },
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      scanId: this.$route.params.scanId,
      scan: null,
      question: null,
      student: null,
      subjectName: '',
      selectedScore: null,
      loading: false,
      submitting: false,
      confirmVisible: false,
      flagVisible: false,
      sessionStats: null,
      statsTimer: null
    }
  },
  computed: {
    existingScores() {
      return this.scan && this.scan.scores ? this.scan.scores : []
    },
    // 是否为待仲裁试卷 (题组长批改, 最终分数为组长所打分数)
    isArbitration() {
      return !!(this.scan && this.scan.arbitration && !this.scan.arbitrationResolved)
    },
    // 当前评卷员应该评第几评
    currentRound() {
      if (this.isArbitration) return 99
      if (!this.question || !this.scan) return 1
      const requiredRounds = this.question.rounds || 1
      const round1 = this.existingScores.find(s => s.round === 1)
      if (!round1) return 1
      if (requiredRounds >= 2 && !this.existingScores.find(s => s.round === 2)) {
        return 2
      }
      return 1
    },
    currentRoundLabel() {
      return this.roundLabel(this.currentRound)
    }
  },
  async mounted() {
    await this.loadTask()
    await this.loadSessionStats()
    // 启动在线时间定时刷新
    this.statsTimer = setInterval(() => this.loadSessionStats(), 5000)
  },
  beforeUnmount() {
    if (this.statsTimer) clearInterval(this.statsTimer)
  },
  methods: {
    async loadTask() {
      this.loading = true
      try {
        const res = await gradeApi.getTask(this.scanId)
        this.scan = res.data.scan
        this.question = res.data.question
        this.student = res.data.student

        const subjectsRes = await subjectApi.getAll()
        const subject = subjectsRes.data.find(s => s.id === this.scan.subjectId)
        this.subjectName = subject ? subject.name : this.scan.subjectId

        const myScore = this.existingScores.find(s => s.graderId === this.user.id)
        if (myScore) {
          this.selectedScore = myScore.score
        }
      } catch (err) {
        this.$message.error('加载任务失败')
      } finally {
        this.loading = false
      }
    },
    async loadSessionStats() {
      try {
        const res = await authApi.getSession(this.user.id)
        this.sessionStats = res.data
      } catch (err) {
        // 会话可能未记录
      }
    },
    confirmSubmit() {
      if (this.selectedScore === null || this.selectedScore === undefined) {
        this.$message.warning('请选择分数')
        return
      }
      this.confirmVisible = true
    },
    async doSubmit() {
      this.submitting = true
      try {
        if (this.isArbitration) {
          // 题组长仲裁: 最终分数为组长所打分数
          await gradeApi.submitArbitration({
            scanId: parseInt(this.scanId),
            leaderId: this.user.id,
            score: this.selectedScore
          })
          this.$message.success('仲裁评分已提交，该试卷以您打的分数为最终分数')
        } else {
          await gradeApi.submit({
            scanId: parseInt(this.scanId),
            graderId: this.user.id,
            score: this.selectedScore,
            round: this.currentRound
          })
          this.$message.success('评分提交成功')
        }
        this.confirmVisible = false
        await this.loadSessionStats()

        // 自动进入下一题
        const tasksRes = await gradeApi.getTasks(this.user.id)
        const remaining = tasksRes.data.tasks.filter(t => t.id !== parseInt(this.scanId))
        if (remaining.length > 0) {
          const nextTask = remaining[0]
          this.$message.info(`自动进入下一题: 考号 ${nextTask.examNo}`)
          this.scanId = nextTask.id
          this.selectedScore = null
          await this.loadTask()
          // 更新 URL（避免路由历史混乱）
          this.$router.replace(`/app/grade/${nextTask.id}`)
        } else {
          this.$message.success('所有任务已完成，返回任务列表')
          this.$router.push('/app/grade')
        }
      } catch (err) {
        this.$message.error(err.response?.data?.error || '提交失败')
      } finally {
        this.submitting = false
      }
    },
    showFlagDialog() {
      this.flagVisible = true
    },
    async doFlag(reason) {
      try {
        await gradeApi.flag({
          scanId: parseInt(this.scanId),
          graderId: this.user.id,
          reason
        })
        this.$message.success(`已标记为${reason === 'blur' ? '模糊' : '错误'}，试卷已退回题组长`)
        this.flagVisible = false
        // 自动进入下一题
        const tasksRes = await gradeApi.getTasks(this.user.id)
        const remaining = tasksRes.data.tasks.filter(t => t.id !== parseInt(this.scanId))
        if (remaining.length > 0) {
          const nextTask = remaining[0]
          this.scanId = nextTask.id
          this.selectedScore = null
          await this.loadTask()
          this.$router.replace(`/app/grade/${nextTask.id}`)
        } else {
          this.$router.push('/app/grade')
        }
      } catch (err) {
        this.$message.error(err.response?.data?.error || '标记失败')
      }
    },
    roundLabel(round) {
      if (round === 1) return '一评'
      if (round === 99) return '仲裁'
      return '二评'
    },
    formatDuration(seconds) {
      if (!seconds && seconds !== 0) return '--'
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = seconds % 60
      if (h > 0) return `${h}小时${m}分${s}秒`
      if (m > 0) return `${m}分${s}秒`
      return `${s}秒`
    },
    goBack() {
      this.$router.push('/app/grade')
    }
  }
}
</script>

<style scoped>
.grade-task-page {
  max-width: 1400px;
  margin: 0 auto;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.image-container {
  text-align: center;
  min-height: 400px;
  display: flex;
  justify-content: center;
  align-items: center;
}
.stats-footer {
  margin-top: 20px;
}
.stat-item {
  text-align: center;
  padding: 10px;
}
.stat-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}
.stat-value {
  font-size: 24px;
  font-weight: bold;
  color: #409EFF;
}
.stat-tip {
  text-align: center;
  color: #C0C4CC;
  font-size: 12px;
  margin-top: 8px;
}
</style>
