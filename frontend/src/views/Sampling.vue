<template>
  <div class="sampling-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>抽查试卷</span>
          <div class="filter-area">
            <el-select
              v-model="filterSubject"
              placeholder="科目"
              clearable
              :disabled="isSubjectLeader || isQuestionLeader"
              style="width: 150px"
              @change="loadData"
            >
              <el-option v-for="s in visibleSubjects" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-select
              v-model="filterQuestion"
              placeholder="题目"
              clearable
              filterable
              :disabled="isQuestionLeader"
              style="width: 250px"
              @change="loadData"
            >
              <el-option v-for="q in visibleQuestions" :key="q.id" :label="q.name" :value="q.id" />
            </el-select>
            <el-input v-model="filterExamNo" placeholder="考号" clearable style="width: 150px" @clear="loadData" @keyup.enter="loadData" />
            <el-button type="primary" @click="loadData">查询</el-button>
          </div>
        </div>
      </template>

      <el-table :data="samplingList" border style="width: 100%" v-loading="loading">
        <el-table-column prop="examNo" label="考号" width="100" />
        <el-table-column prop="studentName" label="学生姓名" width="100" />
        <el-table-column label="科目" width="80">
          <template #default="{ row }">{{ getSubjectName(row.subjectId) }}</template>
        </el-table-column>
        <el-table-column prop="questionName" label="题目" width="120" />
        <el-table-column label="试卷图片" width="100">
          <template #default="{ row }">
            <el-image
              :src="row.imagePath"
              :preview-src-list="[row.imagePath]"
              style="width: 60px; height: 60px"
              fit="cover"
            />
          </template>
        </el-table-column>
        <el-table-column label="评分详情" min-width="250">
          <template #default="{ row }">
            <div v-for="(s, i) in row.scores" :key="i">
              <el-tag type="info" size="small">
                {{ s.graderName }}: {{ s.score }}分 ({{ roundLabel(s.round) }})
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="最终分数" width="140">
          <template #default="{ row }">
            <el-tag :type="row.arbitrationResolved ? 'danger' : 'success'" size="large">
              {{ getFinalScore(row) }} / {{ row.maxScore }}
            </el-tag>
            <div v-if="row.arbitrationResolved" style="font-size: 12px; color: #e6a23c">
              仲裁定分{{ row.finalGraderName ? ' (' + row.finalGraderName + ')' : '' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="试卷详情" width="80%">
      <div v-if="detailData" class="detail-content">
        <el-row :gutter="20">
          <el-col :span="14">
            <el-card shadow="never">
              <template #header>试卷图片</template>
              <el-image
                :src="detailData.imagePath"
                :preview-src-list="[detailData.imagePath]"
                fit="contain"
                style="max-width: 100%; max-height: 500px"
              />
            </el-card>
          </el-col>
          <el-col :span="10">
            <el-card shadow="never">
              <template #header>评分信息</template>
              <el-descriptions :column="1" border>
                <el-descriptions-item label="考号">{{ detailData.examNo }}</el-descriptions-item>
                <el-descriptions-item label="学生姓名">{{ detailData.studentName }}</el-descriptions-item>
                <el-descriptions-item label="科目">{{ getSubjectName(detailData.subjectId) }}</el-descriptions-item>
                <el-descriptions-item label="题目">{{ detailData.questionName }}</el-descriptions-item>
                <el-descriptions-item label="满分">{{ detailData.maxScore }}分</el-descriptions-item>
              </el-descriptions>
              <div style="margin-top: 16px">
                <h4>评分记录</h4>
                <div v-for="(s, i) in detailData.scores" :key="i" style="margin-bottom: 8px">
                  <el-tag type="success">
                    {{ s.graderName }}: {{ s.score }}分 ({{ roundLabel(s.round) }})
                  </el-tag>
                </div>
              </div>
              <div style="margin-top: 16px">
                <h4>最终分数</h4>
                <el-tag :type="detailData.arbitrationResolved ? 'danger' : 'success'" size="large">
                  {{ getFinalScore(detailData) }} / {{ detailData.maxScore }} 分
                </el-tag>
                <div v-if="detailData.arbitrationResolved" style="margin-top: 8px; color: #e6a23c; font-size: 13px">
                  该试卷经仲裁，最终分数为题组长 ({{ detailData.finalGraderName }}) 所打分数
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import { samplingApi, subjectApi } from '../api'

export default {
  name: 'Sampling',
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      subjects: [],
      questions: [],
      filterSubject: '',
      filterQuestion: '',
      filterExamNo: '',
      samplingList: [],
      loading: false,
      detailVisible: false,
      detailData: null
    }
  },
  computed: {
    isSubjectLeader() {
      return this.user.role === 'subject_leader'
    },
    isQuestionLeader() {
      return this.user.role === 'question_leader'
    },
    // 科组长/题组长只能看本科目; 题组长只能看本人题目
    visibleSubjects() {
      if ((this.isSubjectLeader || this.isQuestionLeader) && this.user.subjectId) {
        return this.subjects.filter(s => s.id === this.user.subjectId)
      }
      return this.subjects
    },
    visibleQuestions() {
      if (this.isQuestionLeader && this.user.subjectId) {
        return this.questions.filter(q =>
          q.subjectId === this.user.subjectId && q.id === this.user.questionId
        )
      }
      if ((this.isSubjectLeader || this.isQuestionLeader) && this.user.subjectId) {
        return this.questions.filter(q => q.subjectId === this.user.subjectId)
      }
      return this.questions
    }
  },
  async mounted() {
    const [subjectsRes, questionsRes] = await Promise.all([
      subjectApi.getAll(),
      subjectApi.getAllQuestions()
    ])
    this.subjects = subjectsRes.data
    this.questions = questionsRes.data

    // 科组长默认筛选自己科目 (可查本科目全部题目)
    if (this.user.role === 'subject_leader') {
      this.filterSubject = this.user.subjectId
    }
    // 题组长默认锁定本人科目+本人题目
    if (this.user.role === 'question_leader') {
      this.filterSubject = this.user.subjectId
      this.filterQuestion = this.user.questionId
    }

    await this.loadData()
  },
  methods: {
    async loadData() {
      this.loading = true
      try {
        const params = { requesterId: this.user.id }
        if (this.filterSubject) params.subjectId = this.filterSubject
        if (this.filterQuestion) params.questionId = this.filterQuestion
        if (this.filterExamNo) params.examNo = this.filterExamNo
        const res = await samplingApi.getList(params)
        this.samplingList = res.data
      } catch (err) {
        this.$message.error(err.response?.data?.error || '加载失败')
      } finally {
        this.loading = false
      }
    },
    getSubjectName(id) {
      const s = this.subjects.find(s => s.id === id)
      return s ? s.name : id
    },
    getFinalScore(row) {
      // 仲裁完成的试卷, 最终分数为题组长所打分数
      if (row.arbitrationResolved && row.finalScore != null) {
        return row.finalScore
      }
      if (!row.scores || row.scores.length === 0) return 0
      const sum = row.scores.reduce((acc, s) => acc + s.score, 0)
      return Math.round(sum / row.scores.length)
    },
    roundLabel(round) {
      if (round === 1) return '一评'
      if (round === 99) return '仲裁'
      return '二评'
    },
    viewDetail(row) {
      this.detailData = row
      this.detailVisible = true
    }
  }
}
</script>

<style scoped>
.sampling-page {
  max-width: 1200px;
  margin: 0 auto;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.filter-area {
  display: flex;
  gap: 10px;
}
</style>
