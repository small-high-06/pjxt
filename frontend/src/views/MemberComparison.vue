<template>
  <div class="member-comparison-page">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>组员对比</span>
          <div class="filter-area">
            <el-select v-model="filterScope" placeholder="范围" style="width: 150px" @change="onFilterChange">
              <el-option label="全部科目" value="all" />
              <el-option label="按科目" value="subject" :disabled="user.level > 1" />
              <el-option label="按题目" value="question" />
            </el-select>
            <el-select v-if="filterScope === 'subject'" v-model="filterSubject" placeholder="科目" style="width: 150px" @change="loadData">
              <el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" />
            </el-select>
            <el-select v-if="filterScope === 'question'" v-model="filterQuestion" placeholder="题目" style="width: 250px" @change="loadData" filterable>
              <el-option v-for="q in questions" :key="q.id" :label="q.name" :value="q.id" />
            </el-select>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab">
        <!-- 工作量分析 -->
        <el-tab-pane label="工作量分析" name="workload">
          <div ref="workloadChartRef" style="width: 100%; height: 400px"></div>
          <el-table :data="workloadData" border style="width: 100%; margin-top: 20px">
            <el-table-column prop="graderId" label="账号" width="120" />
            <el-table-column prop="graderName" label="姓名" width="150" />
            <el-table-column prop="gradedCount" label="评卷数量" width="120" />
            <el-table-column label="科目">
              <template #default="{ row }">{{ getSubjectName(row.subjectId) }}</template>
            </el-table-column>
            <el-table-column prop="questionIndex" label="题号" width="80">
              <template #default="{ row }">第{{ row.questionIndex }}题</template>
            </el-table-column>
            <el-table-column label="操作" width="110">
              <template #default="{ row }">
                <el-button size="small" @click="viewProfile(row)">查看资料</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 给分分布分析 -->
        <el-tab-pane label="给分分布分析" name="distribution">
          <div ref="distributionChartRef" style="width: 100%; height: 400px"></div>
          <el-card shadow="never" style="margin-top: 20px">
            <template #header>题目平均得分</template>
            <el-table :data="distributionData.questionAvg" border style="width: 100%">
              <el-table-column prop="questionName" label="题目" width="150" />
              <el-table-column prop="maxScore" label="满分" width="80" />
              <el-table-column prop="avgScore" label="平均得分" width="120" />
              <el-table-column prop="scoreCount" label="评分数" width="100" />
              <el-table-column label="得分率">
                <template #default="{ row }">
                  {{ row.maxScore > 0 ? ((row.avgScore / row.maxScore) * 100).toFixed(1) : 0 }}%
                </template>
              </el-table-column>
            </el-table>
          </el-card>

          <el-card shadow="never" style="margin-top: 20px" v-if="distributionData.graderSeries.length > 0">
            <template #header>评卷员给分统计</template>
            <el-table :data="distributionData.graderSeries" border style="width: 100%">
              <el-table-column prop="graderName" label="姓名" width="150" />
              <el-table-column prop="avgScore" label="平均给分" width="120" />
              <el-table-column prop="count" label="评卷数" width="100" />
              <el-table-column label="各分数点计数">
                <template #default="{ row }">
                  <span v-for="(c, i) in row.series" :key="i" style="margin-right: 12px">
                    {{ distributionData.scorePoints[i] }}分:{{ c }}次
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-tab-pane>

        <!-- 误差分析 -->
        <el-tab-pane label="误差分析" name="error">
          <div class="error-analysis">
            <el-alert title="误差分析" type="info" :closable="false" show-icon>
              误差分析展示同一份试卷不同评卷员之间的评分差异。
            </el-alert>
            <el-table :data="errorData" border style="width: 100%; margin-top: 20px">
              <el-table-column prop="examNo" label="考号" width="120" />
              <el-table-column prop="questionName" label="题目" width="150" />
              <el-table-column label="评分1" width="120">
                <template #default="{ row }">{{ row.scores[0] ? row.scores[0].graderName + ': ' + row.scores[0].score : '-' }}</template>
              </el-table-column>
              <el-table-column label="评分2" width="120">
                <template #default="{ row }">{{ row.scores[1] ? row.scores[1].graderName + ': ' + row.scores[1].score : '-' }}</template>
              </el-table-column>
              <el-table-column label="分差" width="100">
                <template #default="{ row }">
                  <el-tag v-if="row.scores.length >= 2" :type="getDiffType(row.scores)">
                    {{ Math.abs(row.scores[0].score - row.scores[1].score) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="误差等级">
                <template #default="{ row }">
                  <el-tag v-if="row.scores.length >= 2" :type="getDiffType(row.scores)">
                    {{ getDiffLevel(row.scores) }}
                  </el-tag>
                </template>
              </el-table-column>
            </el-table>

            <!-- 误差异常计数 -->
            <el-card shadow="never" style="margin-top: 20px">
              <template #header>误差异常评卷员统计 (分差 &gt; 15)</template>
              <el-alert
                v-if="errorAnomalies.length === 0"
                title="当前范围内没有误差异常的评卷员"
                type="success"
                :closable="false"
                show-icon
              />
              <el-table v-else :data="errorAnomalies" border>
                <el-table-column prop="graderName" label="姓名" width="150" />
                <el-table-column prop="graderId" label="账号" width="150" />
                <el-table-column label="误差异常次数">
                  <template #default="{ row }">
                    <el-tag type="danger">{{ row.count }} 次</el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </el-card>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

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
import * as echarts from 'echarts'
import { comparisonApi, samplingApi, subjectApi, profileApi } from '../api'

export default {
  name: 'MemberComparison',
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      activeTab: 'workload',
      filterScope: 'all',
      filterSubject: '',
      filterQuestion: '',
      subjects: [],
      questions: [],
      workloadData: [],
      workloadChartMeta: { dates: [], avgSeries: [], avgLabel: '小组平均' },
      distributionData: { scorePoints: [], graderSeries: [], questionAvg: [] },
      errorData: [],
      workloadChart: null,
      distributionChart: null,
      profileVisible: false,
      profileData: null
    }
  },
  computed: {
    // 误差异常评卷员计数 (分差 > 15, 双方评卷员各计 1 次, 不含仲裁轮)
    errorAnomalies() {
      const map = {}
      this.errorData.forEach(row => {
        const rs = row.scores.filter(s => s.round !== 99)
        if (rs.length < 2) return
        const diff = Math.abs(rs[0].score - rs[1].score)
        if (diff > 15) {
          rs.forEach(s => {
            if (!map[s.graderId]) {
              map[s.graderId] = { graderId: s.graderId, graderName: s.graderName, count: 0 }
            }
            map[s.graderId].count++
          })
        }
      })
      return Object.values(map).sort((a, b) => b.count - a.count)
    }
  },
  watch: {
    // 切换 tab 时重新渲染对应图表 (隐藏的 tab 容器宽高为 0, 初始化会得到空白图表)
    activeTab(tab) {
      this.$nextTick(() => {
        if (tab === 'workload') {
          this.renderWorkloadChart()
        } else if (tab === 'distribution') {
          this.renderDistributionChart()
        }
      })
    }
  },
  async mounted() {
    const [subjectsRes, questionsRes] = await Promise.all([
      subjectApi.getAll(),
      subjectApi.getAllQuestions()
    ])
    this.subjects = subjectsRes.data
    this.questions = questionsRes.data

    // 根据用户角色设置默认范围
    if (this.user.role === 'subject_leader') {
      this.filterScope = 'subject'
      this.filterSubject = this.user.subjectId
    } else if (this.user.role === 'question_leader') {
      this.filterScope = 'question'
      this.filterQuestion = this.user.questionId
    }

    await this.loadData()
    window.addEventListener('resize', this.handleResize)
  },
  beforeUnmount() {
    if (this.workloadChart) this.workloadChart.dispose()
    if (this.distributionChart) this.distributionChart.dispose()
    window.removeEventListener('resize', this.handleResize)
  },
  methods: {
    handleResize() {
      if (this.workloadChart) this.workloadChart.resize()
      if (this.distributionChart) this.distributionChart.resize()
    },
    onFilterChange() {
      this.filterSubject = ''
      this.filterQuestion = ''
      // 如果是科组长切到subject自动填
      if (this.filterScope === 'subject' && this.user.role === 'subject_leader') {
        this.filterSubject = this.user.subjectId
      }
      // 如果是题组长切到question自动填
      if (this.filterScope === 'question' && this.user.role === 'question_leader') {
        this.filterQuestion = this.user.questionId
      }
      this.loadData()
    },
    getParams() {
      const params = {}
      if (this.filterScope === 'subject' && this.filterSubject) {
        params.scope = 'subject'
        params.subjectId = this.filterSubject
      } else if (this.filterScope === 'question' && this.filterQuestion) {
        params.scope = 'question'
        params.questionId = this.filterQuestion
      }
      return params
    },
    async loadData() {
      const params = this.getParams()

      // 加载工作量 (折线图数据)
      const workloadRes = await comparisonApi.getWorkload(params)
      this.workloadData = workloadRes.data.graderSeries || []
      this.workloadChartMeta = {
        dates: workloadRes.data.dates || [],
        avgSeries: workloadRes.data.avgSeries || [],
        avgLabel: workloadRes.data.avgLabel || '小组平均'
      }

      // 加载给分分布 (折线图数据)
      const distRes = await comparisonApi.getScoreDistribution(params)
      this.distributionData = {
        scorePoints: distRes.data.scorePoints || [],
        graderSeries: distRes.data.graderSeries || [],
        questionAvg: distRes.data.questionAvg || []
      }

      // 加载误差分析 (获取已评的扫描记录)
      const samplingRes = await samplingApi.getList(params)
      this.errorData = samplingRes.data.filter(s => s.scores.length >= 2)

      this.$nextTick(() => {
        this.renderWorkloadChart()
        this.renderDistributionChart()
      })
    },
    renderWorkloadChart() {
      const el = this.$refs.workloadChartRef
      if (!el) return
      if (this.workloadChart) this.workloadChart.dispose()
      this.workloadChart = echarts.init(el)

      const dates = this.workloadChartMeta.dates
      const series = []
      // 各评卷员折线
      const colors = ['#5470C6', '#91CC75', '#EE6666', '#FAC858', '#73C0DE', '#FC8452', '#9A60B4', '#EA7CCC']
      this.workloadData.forEach((g, idx) => {
        series.push({
          name: g.graderName,
          type: 'line',
          data: g.series,
          smooth: true,
          itemStyle: { color: colors[idx % colors.length] },
          label: { show: true, position: 'top' }
        })
      })
      // 小组平均折线
      series.push({
        name: this.workloadChartMeta.avgLabel,
        type: 'line',
        data: this.workloadChartMeta.avgSeries,
        smooth: true,
        lineStyle: { width: 3, type: 'dashed' },
        itemStyle: { color: '#333' },
        label: { show: true, position: 'top', formatter: '{c}' }
      })

      const option = {
        title: { text: '工作量分析 (按日)', left: 'center' },
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: '5%', right: '5%', bottom: '15%', containLabel: true },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: 30 } },
        yAxis: { type: 'value', name: '评卷数量' },
        series
      }
      this.workloadChart.setOption(option)
    },
    renderDistributionChart() {
      const el = this.$refs.distributionChartRef
      if (!el) return
      if (this.distributionChart) this.distributionChart.dispose()
      this.distributionChart = echarts.init(el)

      const scorePoints = this.distributionData.scorePoints
      const series = []
      const colors = ['#5470C6', '#91CC75', '#EE6666', '#FAC858', '#73C0DE', '#FC8452', '#9A60B4', '#EA7CCC']
      this.distributionData.graderSeries.forEach((g, idx) => {
        series.push({
          name: g.graderName,
          type: 'line',
          data: g.series,
          smooth: true,
          itemStyle: { color: colors[idx % colors.length] },
          label: { show: true, position: 'top' }
        })
      })

      const option = {
        title: { text: '给分分布 (各评卷员)', left: 'center' },
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: '5%', right: '5%', bottom: '15%', containLabel: true },
        xAxis: { type: 'category', data: scorePoints.map(String), name: '分数' },
        yAxis: { type: 'value', name: '评分数' },
        series
      }
      this.distributionChart.setOption(option)
    },
    getSubjectName(id) {
      const s = this.subjects.find(s => s.id === id)
      return s ? s.name : id
    },
    async viewProfile(row) {
      try {
        const res = await profileApi.get(row.graderId, this.user.id)
        this.profileData = res.data
        this.profileVisible = true
      } catch (err) {
        this.$message.error(err.response?.data?.error || '查看资料失败')
      }
    },
    getDiffType(scores) {
      if (scores.length < 2) return 'info'
      const diff = Math.abs(scores[0].score - scores[1].score)
      if (diff <= 5) return 'success'
      if (diff <= 15) return 'warning'
      return 'danger'
    },
    getDiffLevel(scores) {
      if (scores.length < 2) return '未知'
      const diff = Math.abs(scores[0].score - scores[1].score)
      if (diff <= 5) return '正常'
      if (diff <= 15) return '轻微误差'
      return '严重误差'
    }
  }
}
</script>

<style scoped>
.member-comparison-page {
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
