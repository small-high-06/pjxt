<template>
  <div class="scan-page">
    <!-- 已评记录和异常记录 -->
    <el-row :gutter="20">
      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>已上传扫描记录 (整页切分结果)</span>
            </div>
          </template>
          <el-table :data="scans" border size="small" max-height="260">
            <el-table-column prop="examNo" label="考号" width="90" />
            <el-table-column prop="studentName" label="学生" width="90" />
            <el-table-column prop="subjectName" label="科目" width="80" />
            <el-table-column prop="questionIndex" label="题号" width="70">
              <template #default="{ row }">第{{ row.questionIndex }}题</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="90">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)" size="small">{{ statusText(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="uploadedAt" label="上传时间" width="150">
              <template #default="{ row }">{{ formatTime(row.uploadedAt) }}</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :span="8">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>异常标记记录</span>
            </div>
          </template>
          <el-empty v-if="flaggedScans.length === 0" description="暂无异常记录" :image-size="60" />
          <div v-else>
            <el-alert
              v-for="f in flaggedScans"
              :key="f.examNo + f.subjectId + f.questionIndex"
              :title="`${f.studentName} - ${f.subjectName} - 第${f.questionIndex}题`"
              :description="f.flagReason || '试卷不清楚'"
              type="error"
              :closable="false"
              style="margin-bottom: 8px"
            >
              <el-button size="small" type="danger" plain @click="rescanFlagged(f)">重新上传</el-button>
            </el-alert>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 上传 -->
    <el-card style="margin-top: 20px">
      <template #header>
        <div class="card-header">
          <span>扫描图片上传</span>
        </div>
      </template>

      <el-form :model="uploadForm" label-width="120px">
        <el-form-item label="上传模式">
          <el-radio-group v-model="uploadMode" @change="onModeChange">
            <el-radio-button label="fullpage">整页上传 (单科)</el-radio-button>
            <el-radio-button label="student">上传一个学生</el-radio-button>
          </el-radio-group>
          <div class="mode-tip">{{ modeTip }}</div>
        </el-form-item>

        <el-row>
          <el-col :span="8">
            <el-form-item label="学生考号">
              <el-select v-model="uploadForm.examNo" placeholder="选择学生" filterable>
                <el-option
                  v-for="s in students"
                  :key="s.examNo"
                  :label="`${s.examNo} - ${s.name}`"
                  :value="s.examNo"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8" v-if="uploadMode === 'fullpage'">
            <el-form-item label="科目">
              <el-select v-model="uploadForm.subjectId" placeholder="选择科目">
                <el-option v-for="s in subjects" :key="s.id" :label="s.name" :value="s.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 整页上传 (单科): 一张横向照片自动切分 -->
        <el-form-item label="整页照片" v-if="uploadMode === 'fullpage'">
          <div style="width: 100%">
            <el-alert
              :title="fullpageTip"
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 12px"
            />
            <div style="display: flex; gap: 24px; align-items: flex-start">
              <el-upload
                ref="fullpageUploadRef"
                action="#"
                accept="image/*"
                list-type="picture-card"
                :auto-upload="false"
                :limit="1"
                :on-change="onFullpageChange"
                :on-remove="onFullpageRemove"
                :on-exceed="onFullpageExceed"
              >
                <el-icon><Plus /></el-icon>
              </el-upload>
              <div v-if="uploadForm.subjectId">
                <div class="guide-title">切分示意 ({{ selectedSubjectName }})</div>
                <div class="split-guide">
                  <div
                    v-for="r in splitRegions"
                    :key="r.questionIndex"
                    class="split-cell"
                    :style="guideCellStyle(r)"
                  >
                    第{{ r.questionIndex }}题
                  </div>
                </div>
              </div>
            </div>
          </div>
        </el-form-item>

        <!-- 上传一个学生: 语数英各一张整页照片 -->
        <el-form-item label="各科整页照片" v-if="uploadMode === 'student'">
          <div class="student-slots">
            <el-alert
              title="上传一个学生只需 3 张整页照片 (语文/数学/英语各 1 张，横向)，系统自动切分各题"
              type="info"
              :closable="false"
              show-icon
              style="margin-bottom: 12px"
            />
            <div class="slots-row">
              <div v-for="s in subjects" :key="s.id" class="subject-slot">
                <div class="slot-head">
                  {{ s.name }}
                  <el-tag size="small" type="info">1张</el-tag>
                </div>
                <div class="slot-tip">{{ splitRuleText(s.id) }}</div>
                <el-upload
                  :ref="el => (studentUploadRefs[s.id] = el)"
                  action="#"
                  accept="image/*"
                  list-type="picture-card"
                  :auto-upload="false"
                  :limit="1"
                  :on-change="file => onStudentChange(s.id, file)"
                  :on-remove="() => onStudentRemove(s.id)"
                  :on-exceed="files => onStudentExceed(s.id, files)"
                >
                  <el-icon><Plus /></el-icon>
                </el-upload>
              </div>
            </div>
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="submitUpload" :loading="uploading">
            上传扫描图片
          </el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script>
import { Plus, WarningFilled } from '@element-plus/icons-vue'
import { subjectApi, scanApi } from '../api'

export default {
  name: 'Scan',
  components: { Plus, WarningFilled },
  data() {
    return {
      user: JSON.parse(sessionStorage.getItem('currentUser') || '{}'),
      subjects: [],
      students: [],
      scans: [],
      flaggedScans: [],
      uploadMode: 'fullpage',
      uploadForm: { examNo: '', subjectId: '' },
      fullpageFile: null, // 整页模式原始文件
      studentFiles: {}, // 一个学生模式: { subjectId: File }
      studentUploadRefs: {}, // 各科目上传组件引用
      uploading: false
    }
  },
  computed: {
    modeTip() {
      if (this.uploadMode === 'fullpage') return '选择学生+科目，上传一张横向整页照片(长大于宽)，系统自动切分为各题'
      return '选择学生，上传语文/数学/英语各 1 张横向整页照片，系统自动切分为各题'
    },
    selectedSubjectName() {
      const s = this.subjects.find(s => s.id === this.uploadForm.subjectId)
      return s ? s.name : ''
    },
    // 整页模式切分区域 [{questionIndex, x, y, w, h}] (比例 0~1)
    splitRegions() {
      if (this.uploadMode !== 'fullpage' || !this.uploadForm.subjectId) return []
      return this.getSplitRegions(this.uploadForm.subjectId)
    },
    fullpageTip() {
      if (!this.uploadForm.subjectId) return '请先选择科目以查看切分规则'
      return `${this.selectedSubjectName}：${this.splitRuleText(this.uploadForm.subjectId)}`
    }
  },
  async mounted() {
    const [subjectsRes, studentsRes] = await Promise.all([
      subjectApi.getAll(),
      subjectApi.getStudents()
    ])
    this.subjects = subjectsRes.data
    this.students = studentsRes.data
    await Promise.all([this.loadScans(), this.loadFlagged()])
  },
  methods: {
    async loadScans() {
      try {
        const res = await scanApi.getList({})
        this.scans = res.data
      } catch (e) {
        // 忽略
      }
    },
    async loadFlagged() {
      try {
        const res = await scanApi.getFlagged()
        this.flaggedScans = res.data
      } catch (e) {
        // 忽略
      }
    },
    statusType(status) {
      const map = { pending: 'info', grading: 'warning', graded: 'success', flagged: 'danger', arbitration: 'danger' }
      return map[status] || 'info'
    },
    statusText(status) {
      const map = { pending: '待评卷', grading: '评卷中', graded: '已评卷', flagged: '异常标记', arbitration: '仲裁中' }
      return map[status] || status
    },
    formatTime(t) {
      if (!t) return '-'
      const d = new Date(t)
      return `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    },
    rescanFlagged(row) {
      this.uploadMode = 'fullpage'
      this.uploadForm.examNo = row.examNo
      this.uploadForm.subjectId = row.subjectId
      this.$message.info(`已填充 ${row.studentName} - ${row.subjectName}，请重新上传该科目整页照片`)
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    },
    // ===================== 切分规则 =====================
    // 按科目返回切分规则: [{questionIndex, x, y, w, h}] 比例 0~1
    getSplitRegions(subjectId) {
      const R = (questionIndex, x, y, w, h) => ({ questionIndex, x, y, w, h })
      // 语文: 横向3块, 第3块=第5题(作文); 第1块上下平分=第1/2题; 第2块上下平分=第3/4题
      if (subjectId === 'chinese') {
        return [
          R(1, 0, 0, 1 / 3, 0.5), R(2, 0, 0.5, 1 / 3, 0.5),
          R(3, 1 / 3, 0, 1 / 3, 0.5), R(4, 1 / 3, 0.5, 1 / 3, 0.5),
          R(5, 2 / 3, 0, 1 / 3, 1)
        ]
      }
      // 数学: 田字格4块, 左上=第1题, 左下=第2题, 右上=第3题, 右下=第4题
      if (subjectId === 'math') {
        return [
          R(1, 0, 0, 0.5, 0.5), R(2, 0, 0.5, 0.5, 0.5),
          R(3, 0.5, 0, 0.5, 0.5), R(4, 0.5, 0.5, 0.5, 0.5)
        ]
      }
      // 英语: 横向3块, 从左到右=第1/2/3题
      if (subjectId === 'english') {
        return [
          R(1, 0, 0, 1 / 3, 1), R(2, 1 / 3, 0, 1 / 3, 1), R(3, 2 / 3, 0, 1 / 3, 1)
        ]
      }
      // 其他科目: 按题目数量横向均分
      const subject = this.subjects.find(s => s.id === subjectId)
      const count = (subject && subject.questionCount) || 1
      const w = 1 / count
      return Array.from({ length: count }, (_, i) => R(i + 1, i * w, 0, w, 1))
    },
    splitRuleText(subjectId) {
      if (subjectId === 'chinese') return '横向均分3块：块1上下平分=第1/2题，块2上下平分=第3/4题，块3=第5题(作文)'
      if (subjectId === 'math') return '田字格4块：左上=第1题，左下=第2题，右上=第3题，右下=第4题'
      if (subjectId === 'english') return '横向均分3块：从左到右=第1/2/3题'
      const n = this.getSplitRegions(subjectId).length
      return `横向均分${n}块：从左到右=第1~${n}题`
    },
    guideCellStyle(r) {
      return {
        left: r.x * 100 + '%',
        top: r.y * 100 + '%',
        width: r.w * 100 + '%',
        height: r.h * 100 + '%'
      }
    },
    // ===================== 文件选择 =====================
    onFullpageChange(file) {
      this.fullpageFile = file.raw || null
    },
    onFullpageRemove() {
      this.fullpageFile = null
    },
    onFullpageExceed(files) {
      // 超出1张限制时, 用新选的文件替换旧的
      this.$refs.fullpageUploadRef.clearFiles()
      const file = files[0]
      this.$refs.fullpageUploadRef.handleStart(file)
      this.fullpageFile = file
    },
    onStudentChange(subjectId, file) {
      this.studentFiles[subjectId] = file.raw || null
    },
    onStudentRemove(subjectId) {
      this.studentFiles[subjectId] = null
    },
    onStudentExceed(subjectId, files) {
      const ref = this.studentUploadRefs[subjectId]
      if (!ref) return
      ref.clearFiles()
      const file = files[0]
      ref.handleStart(file)
      this.studentFiles[subjectId] = file
    },
    onModeChange() {
      this.fullpageFile = null
      this.studentFiles = {}
      Object.values(this.studentUploadRefs).forEach(ref => ref && ref.clearFiles && ref.clearFiles())
    },
    resetForm() {
      this.uploadForm = { examNo: '', subjectId: '' }
      this.fullpageFile = null
      this.studentFiles = {}
      if (this.$refs.fullpageUploadRef) this.$refs.fullpageUploadRef.clearFiles()
      Object.values(this.studentUploadRefs).forEach(ref => ref && ref.clearFiles && ref.clearFiles())
    },
    // ===================== 图片处理与上传 =====================
    fileToImage(file) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file)
        const img = new Image()
        img.onload = () => {
          URL.revokeObjectURL(url)
          resolve(img)
        }
        img.onerror = () => {
          URL.revokeObjectURL(url)
          reject(new Error('图片读取失败'))
        }
        img.src = url
      })
    },
    cropRegion(img, r) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * r.w)
      canvas.height = Math.round(img.height * r.h)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(
        img,
        Math.round(img.width * r.x), Math.round(img.height * r.y), canvas.width, canvas.height,
        0, 0, canvas.width, canvas.height
      )
      return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95))
    },
    // 将整页图片按科目规则切分并逐题上传, 返回 { count, replaced }
    async splitAndUploadImage(img, subjectId, examNo) {
      const regions = this.getSplitRegions(subjectId)
      let replaced = 0
      for (const r of regions) {
        const blob = await this.cropRegion(img, r)
        const fd = new FormData()
        fd.append('images', blob, `q${r.questionIndex}.jpg`)
        fd.append('examNo', examNo)
        fd.append('subjectId', subjectId)
        fd.append('questionIndex', String(r.questionIndex))
        const res = await scanApi.upload(fd)
        replaced += res.data.replaced || 0
      }
      return { count: regions.length, replaced }
    },
    successMsg(count, replaced, extra) {
      const msg = replaced > 0
        ? `上传完成，共${count}题（覆盖${replaced}题旧记录）${extra || ''}`
        : `上传完成，共${count}题${extra || ''}`
      this.$message.success(msg)
      this.resetForm()
      this.loadScans()
      this.loadFlagged()
    },
    // ===================== 提交 =====================
    async submitUpload() {
      if (!this.uploadForm.examNo) {
        this.$message.warning('请选择学生考号')
        return
      }
      if (this.uploadMode === 'fullpage') {
        // 单科整页
        if (!this.uploadForm.subjectId) {
          this.$message.warning('请选择科目')
          return
        }
        if (!this.fullpageFile) {
          this.$message.warning('请选择整页照片')
          return
        }
        this.uploading = true
        try {
          const img = await this.fileToImage(this.fullpageFile)
          if (img.width <= img.height) {
            this.$message.error('照片方向不对：请上传横向照片（长大于宽），请将照片横放后重新上传')
            return
          }
          const r = await this.splitAndUploadImage(img, this.uploadForm.subjectId, this.uploadForm.examNo)
          this.successMsg(r.count, r.replaced)
        } catch (err) {
          console.error(err)
          this.$message.error('整页切分上传失败')
        } finally {
          this.uploading = false
        }
      } else {
        // 一个学生: 语数英各一张
        const entries = this.subjects
          .filter(s => this.studentFiles[s.id])
          .map(s => ({ subjectId: s.id, name: s.name, file: this.studentFiles[s.id] }))
        if (entries.length === 0) {
          this.$message.warning('请至少为一个科目选择整页照片')
          return
        }
        this.uploading = true
        try {
          // 先统一校验方向, 避免上传一半失败
          const imgs = []
          for (const e of entries) {
            const img = await this.fileToImage(e.file)
            if (img.width <= img.height) {
              this.$message.error(`${e.name}照片方向不对：请上传横向照片（长大于宽）`)
              return
            }
            imgs.push({ ...e, img })
          }
          let total = 0
          let replaced = 0
          for (const e of imgs) {
            const r = await this.splitAndUploadImage(e.img, e.subjectId, this.uploadForm.examNo)
            total += r.count
            replaced += r.replaced
          }
          this.successMsg(total, replaced, `（${imgs.length}个科目）`)
        } catch (err) {
          console.error(err)
          this.$message.error('整页切分上传失败')
        } finally {
          this.uploading = false
        }
      }
    }
  }
}
</script>

<style scoped>
.scan-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mode-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}
.guide-title {
  font-size: 13px;
  color: #606266;
  margin-bottom: 6px;
}
.split-guide {
  position: relative;
  width: 260px;
  height: 180px;
  border: 1px solid #dcdfe6;
  background: #f5f7fa;
  border-radius: 4px;
}
.split-cell {
  position: absolute;
  border: 1px dashed #409eff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #409eff;
  background: rgba(64, 158, 255, 0.06);
  box-sizing: border-box;
}
.student-slots {
  width: 100%;
}
.slots-row {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.subject-slot {
  flex: 1;
  min-width: 240px;
}
.slot-head {
  font-size: 14px;
  font-weight: bold;
  color: #303133;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.slot-tip {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
  min-height: 32px;
}
</style>
