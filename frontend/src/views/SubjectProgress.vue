<template>
  <div class="subject-progress-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>科目进度</span>
          <el-select v-model="selectedSubject" placeholder="选择科目" style="width: 200px" @change="loadData">
            <el-option v-if="user.role === 'admin'" label="全部科目" value="" />
            <el-option
              v-for="s in visibleSubjects"
              :key="s.id"
              :label="s.name"
              :value="s.id"
            />
          </el-select>
        </div>
      </template>

      <!-- 科目总进度: 各题进度之和 ÷ 该科目题目数 -->
      <el-row v-if="allProgress.length > 0" :gutter="20" style="margin-bottom: 20px">
        <el-col v-for="sp in allProgress" :key="sp.subjectId" :span="8">
          <el-card shadow="never">
            <div class="stat-card">
              <div class="stat-label">{{ sp.subjectName }} 总进度</div>
              <div class="stat-value" :style="{ color: totalColor(sp.totalPercent) }">
                {{ sp.totalPercent }}%
              </div>
              <div class="stat-sub">
                各题进度之和 ÷ 题目数 ({{ sp.questionProgress.length }} 题)
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <div ref="chartRef" style="width: 100%; height: 400px"></div>

      <el-table :data="tableData" border style="width: 100%; margin-top: 20px">
        <el-table-column prop="subjectName" label="科目" width="100" />
        <el-table-column prop="questionIndex" label="题号" width="80" />
        <el-table-column prop="name" label="题目名称" width="150" />
        <el-table-column prop="totalScans" label="总扫描数" width="100" />
        <el-table-column prop="gradedScans" label="已评数" width="100" />
        <el-table-column label="进度" width="200">
          <template #default="{ row }">
            <el-progress :percentage="row.percent" :status="row.percent === 100 ? 'success' : ''" />
          </template>
        </el-table-column>
        <el-table-column prop="percent" label="百分比" width="80">
          <template #default="{ row }">{{ row.percent }}%</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import * as echarts from 'echarts'
import { progressApi, subjectApi } from '../api'

export default {
  name: 'SubjectProgress',
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      selectedSubject: '',
      subjects: [],
      allProgress: [],
      chartInstance: null
    }
  },
  computed: {
    visibleSubjects() {
      // 科组长只看本学科, 题组长只看本学科, 管理员全部
      if (this.user.role === 'subject_leader' && this.user.subjectId) {
        return this.subjects.filter(s => s.id === this.user.subjectId)
      }
      if (this.user.role === 'question_leader' && this.user.subjectId) {
        return this.subjects.filter(s => s.id === this.user.subjectId)
      }
      return this.subjects
    },
    tableData() {
      let data = []
      this.allProgress.forEach(sp => {
        sp.questionProgress.forEach(qp => {
          data.push({
            subjectName: sp.subjectName,
            questionIndex: qp.questionIndex,
            name: qp.name,
            totalScans: qp.totalScans,
            gradedScans: qp.gradedScans,
            percent: qp.percent
          })
        })
      })
      return data
    }
  },
  async mounted() {
    const subjectsRes = await subjectApi.getAll()
    this.subjects = subjectsRes.data

    // 科组长/题组长强制只看本学科
    if ((this.user.role === 'subject_leader' || this.user.role === 'question_leader') && this.user.subjectId) {
      this.selectedSubject = this.user.subjectId
    }

    await this.loadData()
  },
  beforeUnmount() {
    if (this.chartInstance) {
      this.chartInstance.dispose()
    }
  },
  methods: {
    async loadData() {
      const res = await progressApi.getAllSubjectProgress()
      let progressData = res.data

      // 权限过滤: 科组长/题组长只看本学科
      if ((this.user.role === 'subject_leader' || this.user.role === 'question_leader') && this.user.subjectId) {
        progressData = progressData.filter(p => p.subjectId === this.user.subjectId)
        this.selectedSubject = this.user.subjectId
      } else if (this.selectedSubject) {
        progressData = progressData.filter(p => p.subjectId === this.selectedSubject)
      }

      this.allProgress = progressData
      this.$nextTick(() => {
        this.renderChart()
      })
    },
    totalColor(percent) {
      if (percent >= 100) return '#67c23a'
      if (percent >= 50) return '#e6a23c'
      return '#f56c6c'
    },
    renderChart() {
      const el = this.$refs.chartRef
      if (!el) return
      if (this.chartInstance) {
        this.chartInstance.dispose()
      }
      this.chartInstance = echarts.init(el)

      const subjects = this.allProgress.map(p => p.subjectName)
      const totalPercents = this.allProgress.map(p => p.totalPercent)
      const questionsData = this.allProgress.map(p => ({
        name: p.subjectName,
        questions: p.questionProgress
      }))

      // 收集所有题号
      const allQuestionNames = []
      this.allProgress.forEach(p => {
        p.questionProgress.forEach(q => {
          allQuestionNames.push(`${p.subjectName}-第${q.questionIndex}题`)
        })
      })
      const questionPercents = []
      this.allProgress.forEach(p => {
        p.questionProgress.forEach(q => {
          questionPercents.push(q.percent)
        })
      })

      const option = {
        title: {
          text: '科目评卷进度统计',
          left: 'center'
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            return `${params[0].name}<br/>进度: ${params[0].value}%`
          }
        },
        grid: { left: '5%', right: '5%', bottom: '10%', containLabel: true },
        xAxis: {
          type: 'category',
          data: allQuestionNames,
          axisLabel: { rotate: 30 }
        },
        yAxis: {
          type: 'value',
          max: 100,
          axisLabel: { formatter: '{value}%' }
        },
        series: [
          {
            name: '评卷进度',
            type: 'bar',
            data: questionPercents,
            itemStyle: {
              color: (params) => {
                const val = params.value
                if (val >= 100) return '#67c23a'
                if (val >= 50) return '#e6a23c'
                return '#f56c6c'
              }
            },
            label: {
              show: true,
              position: 'top',
              formatter: '{c}%'
            }
          }
        ]
      }
      this.chartInstance.setOption(option)
    }
  }
}
</script>

<style scoped>
.subject-progress-page {
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
  padding: 8px 0;
}
.stat-label {
  color: #909399;
  font-size: 14px;
  margin-bottom: 8px;
}
.stat-value {
  font-size: 36px;
  font-weight: bold;
}
.stat-sub {
  color: #c0c4cc;
  font-size: 12px;
  margin-top: 6px;
}
</style>
