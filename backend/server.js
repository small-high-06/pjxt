import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { readDB, writeDB, getUploadDir } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 静态文件服务 - 上传的图片
app.use('/uploads', express.static(getUploadDir()));

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = getUploadDir();
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `scan_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

// ===================== 认证路由 =====================

// 会话活跃超时时间 (毫秒): 超过该时间无心跳视为离线, 自动释放账号
const SESSION_STALE_MS = 2 * 60 * 1000;

// 登录 (同账号同时只能登入一个会话; 离线/残留会话自动释放, 支持强制接管)
app.post('/api/login', (req, res) => {
  const { accountId, password, mode, force } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === accountId && u.password === password);
  if (!user) {
    return res.status(401).json({ error: '账号或密码错误' });
  }
  // 同账号互斥检查
  if (!db.sessions) db.sessions = [];
  const existing = db.sessions.find(s => s.accountId === accountId);
  if (existing) {
    // 超时无心跳的会话视为残留会话 (浏览器未正常退出等), 自动释放
    const lastActive = new Date(existing.lastActiveAt || existing.loginAt).getTime();
    const stale = Date.now() - lastActive > SESSION_STALE_MS;
    if (force || stale) {
      db.sessions = db.sessions.filter(s => s.accountId !== accountId);
    } else {
      return res.status(403).json({
        error: `账号 ${accountId} 已在别处登入，请先退出后再登入`,
        occupied: true
      });
    }
  }
  // 记录会话
  const now = new Date().toISOString();
  const token = `${accountId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  db.sessions.push({
    token,
    accountId,
    loginAt: now,
    sessionStartAt: now,
    lastActiveAt: now,
    gradedCount: 0
  });
  writeDB(db);
  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      level: user.level,
      subjectId: user.subjectId || null,
      questionId: user.questionId || null,
      questionIndex: user.questionIndex || null,
      questionLeaderId: user.questionLeaderId || null,
      mode
    }
  });
});

// 退出登录
app.post('/api/logout', (req, res) => {
  const db = readDB();
  if (!db.sessions) db.sessions = [];
  const { token } = req.body;
  db.sessions = db.sessions.filter(s => s.token !== token);
  writeDB(db);
  res.json({ success: true });
});

// 获取会话统计 (评卷数 + 在线时间), 同时刷新心跳
app.get('/api/session/:accountId', (req, res) => {
  const db = readDB();
  if (!db.sessions) db.sessions = [];
  const session = db.sessions.find(s => s.accountId === req.params.accountId);
  if (!session) return res.status(404).json({ error: '会话不存在' });
  const now = Date.now();
  // 刷新心跳, 供登录时判断会话是否活跃
  session.lastActiveAt = new Date().toISOString();
  writeDB(db);
  const onlineMs = now - new Date(session.sessionStartAt).getTime();
  res.json({
    accountId: session.accountId,
    loginAt: session.loginAt,
    sessionStartAt: session.sessionStartAt,
    gradedCount: session.gradedCount || 0,
    onlineSeconds: Math.floor(onlineMs / 1000)
  });
});

// 获取当前用户信息
app.get('/api/user/:id', (req, res) => {
  const db = readDB();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  res.json({
    id: user.id,
    name: user.name,
    role: user.role,
    level: user.level,
    subjectId: user.subjectId || null,
    questionId: user.questionId || null,
    questionIndex: user.questionIndex || null,
    questionLeaderId: user.questionLeaderId || null
  });
});

// ===================== 科目和题目路由 =====================

// 获取所有科目
app.get('/api/subjects', (req, res) => {
  const db = readDB();
  res.json(db.subjects);
});

// 获取所有题目
app.get('/api/questions', (req, res) => {
  const db = readDB();
  const { subjectId } = req.query;
  let questions = db.questions;
  if (subjectId) {
    questions = questions.filter(q => q.subjectId === subjectId);
  }
  res.json(questions);
});

// 获取所有学生
app.get('/api/students', (req, res) => {
  const db = readDB();
  res.json(db.students);
});

// 添加学生
app.post('/api/students', (req, res) => {
  const db = readDB();
  const { examNo, name } = req.body;
  if (db.students.find(s => s.examNo === examNo)) {
    return res.status(400).json({ error: '考号已存在' });
  }
  db.students.push({ examNo, name });
  writeDB(db);
  res.json({ examNo, name });
});

// ===================== 扫描路由 =====================

// 上传扫描图片 (相同考号+科目+题号时覆盖上一次)
app.post('/api/scan/upload', upload.array('images'), (req, res) => {
  const db = readDB();
  const { examNo, subjectId, questionIndex } = req.body;
  const files = req.files;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: '请选择图片' });
  }

  const qIdx = parseInt(questionIndex);

  // 查找该学生该科目该题号的已有扫描记录
  const existingScans = db.scans.filter(s =>
    s.examNo === examNo &&
    s.subjectId === subjectId &&
    s.questionIndex === qIdx
  );

  // 删除旧记录及其对应的图片文件和评分记录
  existingScans.forEach(scan => {
    // 删除磁盘上的图片文件
    const imgPath = path.join(getUploadDir(), path.basename(scan.imagePath));
    if (fs.existsSync(imgPath)) {
      try { fs.unlinkSync(imgPath); } catch (e) { /* 忽略删除失败 */ }
    }
    // 删除相关的评分记录
    db.scores = db.scores.filter(sc => sc.scanId !== scan.id);
  });

  // 从 scans 数组中移除旧记录
  db.scans = db.scans.filter(s =>
    !(s.examNo === examNo && s.subjectId === subjectId && s.questionIndex === qIdx)
  );

  // 写入新的扫描记录
  const newScans = files.map(file => {
    const scan = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      examNo,
      subjectId,
      questionIndex: qIdx,
      imagePath: `/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString(),
      status: 'pending',
      assignedGraders: [],
      scores: []
    };
    db.scans.push(scan);
    return scan;
  });

  writeDB(db);
  res.json({
    scans: newScans,
    count: newScans.length,
    replaced: existingScans.length
  });
});

// 获取扫描列表
app.get('/api/scans', (req, res) => {
  const db = readDB();
  const { examNo, subjectId, questionIndex, status } = req.query;
  let scans = db.scans;
  if (examNo) scans = scans.filter(s => s.examNo === examNo);
  if (subjectId) scans = scans.filter(s => s.subjectId === subjectId);
  if (questionIndex) scans = scans.filter(s => s.questionIndex === parseInt(questionIndex));
  if (status) scans = scans.filter(s => s.status === status);
  res.json(scans);
});

// ===================== 评卷路由 =====================

// 获取评卷员需要评卷的题目列表
app.get('/api/grade/tasks/:graderId', (req, res) => {
  const db = readDB();
  const grader = db.users.find(u => u.id === req.params.graderId);
  if (!grader) return res.status(404).json({ error: '评卷员不存在' });

  const question = db.questions.find(q => q.id === grader.questionId);
  if (!question) return res.status(404).json({ error: '题目不存在' });

  // 取出该题的所有扫描记录
  const allScans = db.scans.filter(s =>
    s.subjectId === grader.subjectId &&
    s.questionIndex === grader.questionIndex
  );

  // 分配逻辑：
  // - 一评(round=1): 每个评卷员都应参与一次一评。对每份未评完的试卷，
  //   若该评卷员未评过 round 1 且试卷尚未达到 requiredRounds，则需评。
  // - 二评(round=2): 当一评已存在(rounds>=2 的题)，第二个评卷员参与二评。
  const requiredRounds = question.rounds || 1;

  const tasks = allScans.filter(scan => {
    if (!scan.scores) scan.scores = [];
    // 若该试卷已被退回题组长(flagged)则不在评卷员列表
    if (scan.flagged) return false;
    // 仲裁中的试卷不在普通评卷流程中分配
    if (scan.arbitration && !scan.arbitrationResolved) return false;
    // 已经评完则不显示
    if (scan.status === 'graded') return false;
    // 该评卷员是否已评过此试卷
    const myGraded = scan.scores.find(s => s.graderId === grader.id);
    if (myGraded) {
      // 已评过且无需二评或二评已评，不显示
      return false;
    }
    // 需要判断该评卷员应当评第几评
    // 一评: 所有评卷员中第一个未评的参与一评；本题要求二评时，若已有一评则该评卷员参与二评
    const round1Done = scan.scores.find(s => s.round === 1);
    if (!round1Done) {
      // 还没人评过一评：本评卷员可以评一评
      return true;
    } else {
      // 已有一评，判断是否需要二评
      if (requiredRounds >= 2) {
        const round2Done = scan.scores.find(s => s.round === 2);
        if (!round2Done) {
          // 二评应由另一个评卷员评（与一评评卷员不同）
          if (round1Done.graderId !== grader.id) {
            return true;
          }
        }
      }
      return false;
    }
  });

  // 题组长: 待仲裁试卷并入其正常评卷任务列表, 在评卷页面直接批改
  if (grader.role === 'question_leader') {
    const arbScans = allScans.filter(s =>
      s.arbitration === true && !s.arbitrationResolved && !tasks.includes(s)
    );
    tasks.push(...arbScans);
  }

  res.json({ tasks, question, grader });
});

// 获取单个评卷任务
app.get('/api/grade/task/:scanId', (req, res) => {
  const db = readDB();
  const scan = db.scans.find(s => s.id === parseInt(req.params.scanId));
  if (!scan) return res.status(404).json({ error: '任务不存在' });
  const question = db.questions.find(q => q.subjectId === scan.subjectId && q.questionIndex === scan.questionIndex);
  const student = db.students.find(st => st.examNo === scan.examNo);
  res.json({ scan, question, student });
});

// 提交评分 (弹出确认后调用，自动进入下一题)
app.post('/api/grade/submit', (req, res) => {
  const db = readDB();
  const { scanId, graderId, score, round } = req.body;

  const scan = db.scans.find(s => s.id === scanId);
  if (!scan) return res.status(404).json({ error: '扫描记录不存在' });

  const grader = db.users.find(u => u.id === graderId);
  if (!grader) return res.status(404).json({ error: '评卷员不存在' });

  const question = db.questions.find(q => q.subjectId === scan.subjectId && q.questionIndex === scan.questionIndex);
  if (!question) return res.status(404).json({ error: '题目不存在' });

  if (!question.scoreOptions.includes(score)) {
    return res.status(400).json({ error: '评分不在允许的选项中' });
  }

  if (!scan.scores) scan.scores = [];
  if (!scan.assignedGraders) scan.assignedGraders = [];

  // 确定评次：一评或二评
  let actualRound = round;
  if (!actualRound) {
    const round1 = scan.scores.find(s => s.round === 1);
    const requiredRounds = question.rounds || 1;
    if (!round1) {
      actualRound = 1;
    } else if (requiredRounds >= 2 && !scan.scores.find(s => s.round === 2)) {
      actualRound = 2;
    } else {
      actualRound = 1;
    }
  }

  const scoreRecord = {
    id: Date.now() + Math.floor(Math.random() * 10000),
    scanId,
    graderId,
    graderName: grader.name,
    score,
    round: actualRound,
    submittedAt: new Date().toISOString()
  };

  if (!scan.assignedGraders.includes(graderId)) {
    scan.assignedGraders.push(graderId);
  }

  const existingScore = scan.scores.find(s => s.graderId === graderId && s.round === actualRound);
  if (existingScore) {
    existingScore.score = score;
    existingScore.submittedAt = new Date().toISOString();
  } else {
    scan.scores.push(scoreRecord);
  }

  // 更新状态
  const requiredRounds = question.rounds || 1;
  const gradedRounds = scan.scores.length;
  if (gradedRounds >= requiredRounds) {
    // 检查分差: 若分差>10 自动进入仲裁
    if (requiredRounds >= 2) {
      const scores = scan.scores.map(s => s.score);
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const diff = maxScore - minScore;
      if (diff > 10) {
        scan.status = 'arbitration';
        scan.arbitration = true;
        scan.arbitrationReason = `分差 ${diff} 分大于 10，自动进入仲裁`;
        scan.arbitrationAt = new Date().toISOString();
      } else {
        scan.status = 'graded';
      }
    } else {
      scan.status = 'graded';
    }
  } else {
    scan.status = 'partial';
  }

  // 全局 scores 同步
  const globalScoreIdx = db.scores.findIndex(s => s.scanId === scanId && s.graderId === graderId && s.round === actualRound);
  if (globalScoreIdx >= 0) {
    db.scores[globalScoreIdx].score = score;
    db.scores[globalScoreIdx].submittedAt = new Date().toISOString();
  } else {
    db.scores.push(scoreRecord);
  }

  // 累加该会话评卷数量
  if (!db.sessions) db.sessions = [];
  const session = db.sessions.find(s => s.accountId === graderId);
  if (session) {
    session.gradedCount = (session.gradedCount || 0) + 1;
    session.lastActiveAt = new Date().toISOString();
  }

  writeDB(db);
  res.json({ success: true, scan });
});

// 试卷退回题组长 (flagged: 模糊/错误)
app.post('/api/grade/flag', (req, res) => {
  const db = readDB();
  const { scanId, graderId, reason } = req.body;
  const scan = db.scans.find(s => s.id === scanId);
  if (!scan) return res.status(404).json({ error: '扫描记录不存在' });
  const grader = db.users.find(u => u.id === graderId);
  if (!grader) return res.status(404).json({ error: '评卷员不存在' });

  scan.flagged = true;
  scan.flagReason = reason; // 'blur' | 'wrong'
  scan.flagReasonText = reason === 'blur' ? '模糊' : '错误';
  scan.flaggedBy = graderId;
  scan.flaggedByName = grader.name;
  scan.flaggedAt = new Date().toISOString();
  scan.status = 'flagged';

  writeDB(db);
  res.json({ success: true, scan });
});

// 题组长查看退回的试卷
app.get('/api/grade/flagged/:questionLeaderId', (req, res) => {
  const db = readDB();
  const leader = db.users.find(u => u.id === req.params.questionLeaderId);
  if (!leader) return res.status(404).json({ error: '题组长不存在' });
  const flagged = db.scans.filter(s =>
    s.subjectId === leader.subjectId &&
    s.questionIndex === leader.questionIndex &&
    s.flagged === true
  );
  res.json({ flagged, leader });
});

// 题组长查看试卷在哪个评卷员手上
app.get('/api/grade/assignment/:questionLeaderId', (req, res) => {
  const db = readDB();
  const leader = db.users.find(u => u.id === req.params.questionLeaderId);
  if (!leader) return res.status(404).json({ error: '题组长不存在' });
  const allScans = db.scans.filter(s =>
    s.subjectId === leader.subjectId &&
    s.questionIndex === leader.questionIndex
  );
  const result = allScans.map(scan => {
    const student = db.students.find(st => st.examNo === scan.examNo);
    // 当前持有者: 已评过但未评完的评卷员 / 正在评的评卷员
    const holders = [];
    if (scan.scores && scan.scores.length > 0) {
      scan.scores.forEach(s => {
        const g = db.users.find(u => u.id === s.graderId);
        holders.push({
          graderId: s.graderId,
          graderName: s.graderName || (g ? g.name : s.graderId),
          round: s.round,
          score: s.score,
          submittedAt: s.submittedAt
        });
      });
    }
    return {
      scanId: scan.id,
      examNo: scan.examNo,
      studentName: student ? student.name : '未知',
      imagePath: scan.imagePath,
      status: scan.status,
      flagged: scan.flagged || false,
      flagReason: scan.flagReasonText || null,
      holders,
      scores: scan.scores || []
    };
  });
  res.json({ scans: result, leader });
});

// 获取所有被标记为不清晰的试卷 (供扫描页面提示)
app.get('/api/scan/flagged', (req, res) => {
  const db = readDB();
  const flagged = db.scans.filter(s => s.flagged === true).map(scan => {
    const student = db.students.find(st => st.examNo === scan.examNo);
    const subject = db.subjects.find(sub => sub.id === scan.subjectId);
    const question = db.questions.find(q => q.subjectId === scan.subjectId && q.questionIndex === scan.questionIndex);
    return {
      scanId: scan.id,
      examNo: scan.examNo,
      studentName: student ? student.name : '未知',
      subjectId: scan.subjectId,
      subjectName: subject ? subject.name : scan.subjectId,
      questionIndex: scan.questionIndex,
      questionName: question ? question.name : '未知',
      imagePath: scan.imagePath,
      flagReason: scan.flagReason,
      flagReasonText: scan.flagReasonText,
      flaggedBy: scan.flaggedByName,
      flaggedAt: scan.flaggedAt
    };
  });
  res.json({ flagged });
});

// 题组长查看待仲裁试卷
app.get('/api/grade/arbitration/:questionLeaderId', (req, res) => {
  const db = readDB();
  const leader = db.users.find(u => u.id === req.params.questionLeaderId);
  if (!leader) return res.status(404).json({ error: '题组长不存在' });
  const arbitrationScans = db.scans.filter(s =>
    s.subjectId === leader.subjectId &&
    s.questionIndex === leader.questionIndex &&
    s.arbitration === true &&
    !s.arbitrationResolved
  );
  const result = arbitrationScans.map(scan => {
    const student = db.students.find(st => st.examNo === scan.examNo);
    const subject = db.subjects.find(sub => sub.id === scan.subjectId);
    return {
      scanId: scan.id,
      examNo: scan.examNo,
      studentName: student ? student.name : '未知',
      subjectId: scan.subjectId,
      subjectName: subject ? subject.name : '',
      questionIndex: scan.questionIndex,
      imagePath: scan.imagePath,
      status: scan.status,
      arbitrationReason: scan.arbitrationReason,
      arbitrationAt: scan.arbitrationAt,
      scores: scan.scores || []
    };
  });
  res.json({ arbitration: result, leader });
});

// 题组长提交仲裁最终评分
app.post('/api/grade/arbitration/submit', (req, res) => {
  const db = readDB();
  const { scanId, leaderId, score } = req.body;
  const scan = db.scans.find(s => s.id === scanId);
  if (!scan) return res.status(404).json({ error: '扫描记录不存在' });
  if (!scan.arbitration) return res.status(400).json({ error: '该试卷不在仲裁状态' });
  const leader = db.users.find(u => u.id === leaderId);
  if (!leader) return res.status(404).json({ error: '题组长不存在' });

  const question = db.questions.find(q => q.subjectId === scan.subjectId && q.questionIndex === scan.questionIndex);
  if (!question) return res.status(404).json({ error: '题目不存在' });
  if (!question.scoreOptions.includes(score)) {
    return res.status(400).json({ error: '评分不在允许的选项中' });
  }

  // 写入仲裁评分记录
  const arbRecord = {
    id: Date.now() + Math.floor(Math.random() * 10000),
    scanId,
    graderId: leaderId,
    graderName: leader.name,
    score,
    round: 99, // 99 表示仲裁评次
    submittedAt: new Date().toISOString(),
    isArbitration: true
  };

  if (!scan.scores) scan.scores = [];
  scan.scores.push(arbRecord);

  // 题组长为最终评分者，最终分数采用题组长评分
  scan.finalScore = score;
  scan.finalGraderId = leaderId;
  scan.finalGraderName = leader.name;
  scan.status = 'graded';
  scan.arbitration = false; // 仲裁完成, 移出待仲裁列表
  scan.arbitrationResolved = true;
  scan.arbitrationResolvedAt = new Date().toISOString();

  // 同步到全局 scores
  db.scores.push(arbRecord);

  // 累加题组长评卷数
  if (!db.sessions) db.sessions = [];
  const session = db.sessions.find(s => s.accountId === leaderId);
  if (session) {
    session.gradedCount = (session.gradedCount || 0) + 1;
  }

  writeDB(db);
  res.json({ success: true, scan });
});

// ===================== 科目进度路由 =====================

// 获取科目进度
app.get('/api/progress/subject/:subjectId', (req, res) => {
  const db = readDB();
  const subject = db.subjects.find(s => s.id === req.params.subjectId);
  if (!subject) return res.status(404).json({ error: '科目不存在' });

  const questions = db.questions.filter(q => q.subjectId === subject.id);
  const questionProgress = questions.map(q => {
    const totalScans = db.scans.filter(s => s.subjectId === subject.id && s.questionIndex === q.questionIndex).length;
    const gradedScans = db.scans.filter(s => s.subjectId === subject.id && s.questionIndex === q.questionIndex && s.status === 'graded').length;
    const percent = totalScans > 0 ? Math.round((gradedScans / totalScans) * 100) : 0;
    return {
      questionId: q.id,
      questionIndex: q.questionIndex,
      name: q.name,
      maxScore: q.maxScore,
      totalScans,
      gradedScans,
      percent
    };
  });

  const totalPercent = questionProgress.length > 0
    ? Math.round(questionProgress.reduce((sum, q) => sum + q.percent, 0) / questionProgress.length)
    : 0;

  res.json({
    subject: { id: subject.id, name: subject.name, leaderId: subject.leaderId },
    questionProgress,
    totalPercent
  });
});

// 获取所有科目进度
app.get('/api/progress/subjects', (req, res) => {
  const db = readDB();
  const allProgress = db.subjects.map(s => {
    const questions = db.questions.filter(q => q.subjectId === s.id);
    const questionProgress = questions.map(q => {
      const totalScans = db.scans.filter(sc => sc.subjectId === s.id && sc.questionIndex === q.questionIndex).length;
      const gradedScans = db.scans.filter(sc => sc.subjectId === s.id && sc.questionIndex === q.questionIndex && sc.status === 'graded').length;
      return { questionIndex: q.questionIndex, name: q.name, totalScans, gradedScans, percent: totalScans > 0 ? Math.round((gradedScans / totalScans) * 100) : 0 };
    });
    const totalPercent = questionProgress.length > 0
      ? Math.round(questionProgress.reduce((sum, q) => sum + q.percent, 0) / questionProgress.length)
      : 0;
    return {
      subjectId: s.id,
      subjectName: s.name,
      leaderId: s.leaderId,
      questionProgress,
      totalPercent
    };
  });
  res.json(allProgress);
});

// ===================== 题目进度路由 =====================

app.get('/api/progress/question/:questionId', (req, res) => {
  const db = readDB();
  const question = db.questions.find(q => q.id === req.params.questionId);
  if (!question) return res.status(404).json({ error: '题目不存在' });

  const scans = db.scans.filter(s => s.subjectId === question.subjectId && s.questionIndex === question.questionIndex);
  const totalScans = scans.length;
  const gradedScans = scans.filter(s => s.status === 'graded').length;
  const partialScans = scans.filter(s => s.status === 'partial').length;
  const pendingScans = scans.filter(s => s.status === 'pending').length;
  const percent = totalScans > 0 ? Math.round((gradedScans / totalScans) * 100) : 0;

  res.json({
    question: { id: question.id, name: question.name, questionIndex: question.questionIndex, maxScore: question.maxScore, rounds: question.rounds },
    totalScans,
    gradedScans,
    partialScans,
    pendingScans,
    percent
  });
});

// ===================== 组员对比路由 =====================

// 工作量分析 (折线图: 按日期每个评卷员评卷数 + 小组平均)
app.get('/api/comparison/workload', (req, res) => {
  const db = readDB();
  const { subjectId, questionId, scope } = req.query;

  let graders = db.users.filter(u => u.role === 'grader');

  if (scope === 'subject' && subjectId) {
    graders = graders.filter(g => g.subjectId === subjectId);
  }
  if (scope === 'question' && questionId) {
    graders = graders.filter(g => g.questionId === questionId);
  }

  // 收集所有评分日期 (yyyy-mm-dd)
  const dateSet = new Set();
  db.scores.forEach(s => {
    if (s.submittedAt) {
      dateSet.add(s.submittedAt.slice(0, 10));
    }
  });
  const dates = Array.from(dateSet).sort();

  // 每个评卷员每个日期的评卷数
  const graderSeries = graders.map(g => {
    const data = dates.map(d => {
      const count = db.scores.filter(s =>
        s.graderId === g.id &&
        s.submittedAt &&
        s.submittedAt.slice(0, 10) === d
      ).length;
      return count;
    });
    const total = data.reduce((sum, c) => sum + c, 0);
    return {
      graderId: g.id,
      graderName: g.name,
      subjectId: g.subjectId,
      questionId: g.questionId,
      questionIndex: g.questionIndex,
      gradedCount: total,
      series: data
    };
  });

  // 小组平均折线
  const avgSeries = dates.map((d, idx) => {
    const dayCounts = graderSeries.map(g => g.series[idx] || 0);
    const sum = dayCounts.reduce((s, c) => s + c, 0);
    return graderSeries.length > 0 ? Math.round((sum / graderSeries.length) * 10) / 10 : 0;
  });

  res.json({
    dates,
    graderSeries,
    avgSeries,
    avgLabel: '小组平均'
  });
});

// 给分分布分析 (折线图: 各评卷员给分计数, 横轴为分数)
app.get('/api/comparison/score-distribution', (req, res) => {
  const db = readDB();
  const { subjectId, questionId, scope } = req.query;

  let graders = db.users.filter(u => u.role === 'grader');

  if (scope === 'subject' && subjectId) {
    graders = graders.filter(g => g.subjectId === subjectId);
  }
  if (scope === 'question' && questionId) {
    graders = graders.filter(g => g.questionId === questionId);
  }

  // 收集所有可能的分数点 (横轴)
  const scoreSet = new Set();
  db.scores.forEach(s => scoreSet.add(s.score));
  // 同时把题目满分以内的所有评分选项也加入
  let questions = db.questions;
  if (scope === 'subject' && subjectId) {
    questions = questions.filter(q => q.subjectId === subjectId);
  }
  if (scope === 'question' && questionId) {
    questions = questions.filter(q => q.id === questionId);
  }
  questions.forEach(q => {
    (q.scoreOptions || []).forEach(opt => scoreSet.add(opt));
  });
  const scorePoints = Array.from(scoreSet).sort((a, b) => a - b);

  // 每个评卷员在每个分数点的计数
  const graderSeries = graders.map(g => {
    const myScores = db.scores.filter(s => s.graderId === g.id);
    const series = scorePoints.map(sp => myScores.filter(s => s.score === sp).length);
    return {
      graderId: g.id,
      graderName: g.name,
      avgScore: myScores.length > 0 ? Math.round((myScores.reduce((sum, s) => sum + s.score, 0) / myScores.length) * 100) / 100 : 0,
      count: myScores.length,
      series
    };
  });

  // 题目平均分 (仲裁完成的试卷只计入题组长的最终评分)
  const questionAvg = questions.map(q => {
    const scans = db.scans.filter(sc => sc.subjectId === q.subjectId && sc.questionIndex === q.questionIndex);
    const scores = [];
    scans.forEach(scan => {
      if (scan.arbitrationResolved && scan.finalScore != null) {
        scores.push({ score: scan.finalScore });
      } else {
        (scan.scores || []).forEach(s => scores.push(s));
      }
    });
    const avg = scores.length > 0 ? (scores.reduce((sum, s) => sum + s.score, 0) / scores.length).toFixed(2) : 0;
    return {
      questionId: q.id,
      questionName: q.name,
      questionIndex: q.questionIndex,
      maxScore: q.maxScore,
      avgScore: parseFloat(avg),
      scoreCount: scores.length
    };
  });

  res.json({
    scorePoints,
    graderSeries,
    questionAvg
  });
});

// ===================== 抽查试卷路由 =====================

// 抽查列表 (权限: 管理员全部; 科组长限本科目全部题; 题组长/评卷员限本科目本人题目)
app.get('/api/sampling/list', (req, res) => {
  const db = readDB();
  let { subjectId, questionId, examNo, requesterId } = req.query;

  // 按请求者角色强制限制范围
  const requester = db.users.find(u => u.id === requesterId);
  if (requester) {
    if (requester.role === 'subject_leader' && requester.subjectId) {
      // 科组长: 只能抽查本科目的全部题目
      if (subjectId && subjectId !== requester.subjectId) {
        return res.status(403).json({ error: '科组长只能抽查本科目的试卷' });
      }
      subjectId = requester.subjectId;
    } else if (requester.subjectId && requester.questionIndex != null) {
      // 题组长/评卷员: 只能抽查本科目本人负责的题目
      const sameSubject = !subjectId || subjectId === requester.subjectId;
      const sameQuestion = !questionId || questionId === requester.questionId;
      if (!sameSubject || !sameQuestion) {
        return res.status(403).json({ error: '题组长只能抽查本人负责科目的本人题目' });
      }
      subjectId = requester.subjectId;
      questionId = requester.questionId;
    }
  }

  let scans = db.scans.filter(s => s.status === 'graded');

  if (subjectId) scans = scans.filter(s => s.subjectId === subjectId);
  if (questionId) {
    const question = db.questions.find(q => q.id === questionId);
    if (question) {
      scans = scans.filter(s => s.questionIndex === question.questionIndex && s.subjectId === question.subjectId);
    }
  }
  if (examNo) scans = scans.filter(s => s.examNo === examNo);

  const result = scans.map(s => {
    const question = db.questions.find(q => q.subjectId === s.subjectId && q.questionIndex === s.questionIndex);
    const student = db.students.find(st => st.examNo === s.examNo);
    return {
      scanId: s.id,
      examNo: s.examNo,
      studentName: student ? student.name : '未知',
      subjectId: s.subjectId,
      questionIndex: s.questionIndex,
      questionName: question ? question.name : '未知题目',
      imagePath: s.imagePath,
      scores: s.scores || [],
      maxScore: question ? question.maxScore : 0,
      // 仲裁完成的试卷, 最终分数为题组长所打分数
      finalScore: s.finalScore != null ? s.finalScore : null,
      finalGraderName: s.finalGraderName || null,
      arbitrationResolved: !!s.arbitrationResolved
    };
  });

  res.json(result);
});

// ===================== 个人资料路由 =====================

// 完整视图: 姓名/身份证/电话/学校
const fullProfile = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  idCard: u.idCard || '',
  phone: u.phone || '',
  school: u.school || '',
  limited: false
});

// 受限视图: 仅姓名/电话 (题组长查看评卷员时)
const limitedProfile = (u) => ({
  id: u.id,
  name: u.name,
  role: u.role,
  phone: u.phone || '',
  limited: true
});

// 查看资料: 本人完整; 管理员完整; 科组长对本科目题组长/评卷员完整; 题组长对本题评卷员仅姓名+电话
app.get('/api/profile/:id', (req, res) => {
  const db = readDB();
  const { viewerId } = req.query;
  const target = db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  // 本人查看自己的资料
  if (!viewerId || viewerId === target.id) return res.json(fullProfile(target));
  const viewer = db.users.find(u => u.id === viewerId);
  if (!viewer) return res.status(403).json({ error: '无权限查看该资料' });
  if (viewer.role === 'admin') return res.json(fullProfile(target));
  if (viewer.role === 'subject_leader' && viewer.subjectId) {
    if (target.subjectId === viewer.subjectId && ['grader', 'question_leader'].includes(target.role)) {
      return res.json(fullProfile(target));
    }
    return res.status(403).json({ error: '科组长只能查看本科目成员的资料' });
  }
  if (viewer.role === 'question_leader' && target.role === 'grader' && target.questionId === viewer.questionId) {
    return res.json(limitedProfile(target));
  }
  return res.status(403).json({ error: '无权限查看该资料' });
});

// 保存本人资料 (姓名/身份证/电话号码/所在学校)
app.put('/api/profile/:id', (req, res) => {
  const db = readDB();
  const target = db.users.find(u => u.id === req.params.id);
  if (!target) return res.status(404).json({ error: '账号不存在' });
  const { name, idCard, phone, school } = req.body;
  if (name !== undefined && String(name).trim()) target.name = String(name).trim();
  target.idCard = idCard !== undefined ? String(idCard).trim() : (target.idCard || '');
  target.phone = phone !== undefined ? String(phone).trim() : (target.phone || '');
  target.school = school !== undefined ? String(school).trim() : (target.school || '');
  writeDB(db);
  res.json(fullProfile(target));
});

// ===================== 账号管理路由 =====================

// 获取所有用户 (权限: 管理员可看全部, 科组长只能看本科目的账号)
app.get('/api/accounts', (req, res) => {
  const db = readDB();
  const { role, requesterId } = req.query;
  let users = db.users.map(u => {
    const subject = u.subjectId ? db.subjects.find(s => s.id === u.subjectId) : null;
    const question = u.questionId ? db.questions.find(q => q.id === u.questionId) : null;
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      level: u.level,
      password: u.password,
      subjectId: u.subjectId || null,
      subjectName: subject ? subject.name : null,
      questionId: u.questionId || null,
      questionName: question ? question.name : null,
      questionIndex: u.questionIndex || null
    };
  });
  // 科组长只能查看/管理自己科目的账号
  const requester = db.users.find(u => u.id === requesterId);
  if (requester && requester.role === 'subject_leader' && requester.subjectId) {
    users = users.filter(u => u.subjectId === requester.subjectId);
  }
  if (role) users = users.filter(u => u.role === role);
  res.json(users);
});

// 添加评卷员账号 (管理员可添加任意题目的; 科组长只能添加本科目题目的)
app.post('/api/accounts/grader', (req, res) => {
  const db = readDB();
  const { questionId, requesterId } = req.body;
  const question = db.questions.find(q => q.id === questionId);
  if (!question) return res.status(404).json({ error: '题目不存在' });
  const requester = db.users.find(u => u.id === requesterId);
  if (requester && requester.role === 'subject_leader' && requester.subjectId && question.subjectId !== requester.subjectId) {
    return res.status(403).json({ error: '科组长只能添加本科目题目的评卷员' });
  }

  // 账号规律: A010B0C (A=科目代码, B=题号, C=评卷员序号), 如 1010101 = 语文第1题评卷员1
  const prefix = `${question.subjectCode}010${question.questionIndex}0`;
  const existingGraders = db.users.filter(u => u.role === 'grader' && u.id.startsWith(prefix));
  const maxC = existingGraders.reduce((max, g) => {
    const c = parseInt(g.id.slice(prefix.length), 10);
    return isNaN(c) ? max : Math.max(max, c);
  }, 0);

  const newC = maxC + 1;
  const newId = `${prefix}${newC}`;

  const newGrader = {
    id: newId,
    password: '123',
    role: 'grader',
    level: 3,
    subjectId: question.subjectId,
    questionId: question.id,
    questionIndex: question.questionIndex,
    questionLeaderId: question.id,
    name: `${question.name}评卷员${newC}`
  };

  db.users.push(newGrader);
  writeDB(db);
  res.json({
    id: newGrader.id,
    name: newGrader.name,
    role: newGrader.role,
    level: newGrader.level,
    subjectId: newGrader.subjectId,
    questionId: newGrader.questionId,
    questionIndex: newGrader.questionIndex
  });
});

// 删除账号 (管理员可删除任意非管理员账号; 科组长只能删除本科目的账号)
app.delete('/api/accounts/:id', (req, res) => {
  const db = readDB();
  const requesterId = req.query.requesterId;
  const requester = db.users.find(u => u.id === requesterId);
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '账号不存在' });
  if (db.users[idx].role === 'admin') return res.status(400).json({ error: '不能删除管理员账号' });
  if (requester && requester.role === 'subject_leader' && requester.subjectId && db.users[idx].subjectId !== requester.subjectId) {
    return res.status(403).json({ error: '科组长只能删除本科目的账号' });
  }
  db.users.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ===================== 启动服务器 =====================

app.listen(PORT, () => {
  console.log(`OW评卷系统后端服务已启动: http://localhost:${PORT}`);
  console.log(`上传目录: ${getUploadDir()}`);
});
