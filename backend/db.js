import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// 确保上传目录存在
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 初始化数据
function initDatabase() {
  const subjects = [
    { id: 'chinese', name: '语文', code: '1', leaderId: '101', questionCount: 5 },
    { id: 'math', name: '数学', code: '2', leaderId: '201', questionCount: 4 },
    { id: 'english', name: '英语', code: '3', leaderId: '301', questionCount: 3 }
  ];

  // 题目配置 (来自文档2.3)
  const questions = [
    // 语文
    { id: '10101', subjectId: 'chinese', subjectCode: '1', questionIndex: 1, name: '语文第1题', maxScore: 10, scoreOptions: [0, 5, 10], graderCount: 2, rounds: 2 },
    { id: '10102', subjectId: 'chinese', subjectCode: '1', questionIndex: 2, name: '语文第2题', maxScore: 10, scoreOptions: [0, 5, 10], graderCount: 2, rounds: 1 },
    { id: '10103', subjectId: 'chinese', subjectCode: '1', questionIndex: 3, name: '语文第3题', maxScore: 10, scoreOptions: [0, 5, 10], graderCount: 2, rounds: 1 },
    { id: '10104', subjectId: 'chinese', subjectCode: '1', questionIndex: 4, name: '语文第4题', maxScore: 10, scoreOptions: [0, 5, 10], graderCount: 2, rounds: 1 },
    { id: '10105', subjectId: 'chinese', subjectCode: '1', questionIndex: 5, name: '语文第5题', maxScore: 60, scoreOptions: [0, 10, 20, 30, 40, 50, 60], graderCount: 2, rounds: 2 },
    // 数学
    { id: '20101', subjectId: 'math', subjectCode: '2', questionIndex: 1, name: '数学第1题', maxScore: 20, scoreOptions: [0, 5, 10, 15, 20], graderCount: 2, rounds: 1 },
    { id: '20102', subjectId: 'math', subjectCode: '2', questionIndex: 2, name: '数学第2题', maxScore: 20, scoreOptions: [0, 5, 10, 15, 20], graderCount: 2, rounds: 1 },
    { id: '20103', subjectId: 'math', subjectCode: '2', questionIndex: 3, name: '数学第3题', maxScore: 30, scoreOptions: [0, 10, 20, 30], graderCount: 2, rounds: 1 },
    { id: '20104', subjectId: 'math', subjectCode: '2', questionIndex: 4, name: '数学第4题', maxScore: 30, scoreOptions: [0, 10, 20, 30], graderCount: 2, rounds: 2 },
    // 英语
    { id: '30101', subjectId: 'english', subjectCode: '3', questionIndex: 1, name: '英语第1题', maxScore: 25, scoreOptions: [0, 15, 25], graderCount: 2, rounds: 1 },
    { id: '30102', subjectId: 'english', subjectCode: '3', questionIndex: 2, name: '英语第2题', maxScore: 35, scoreOptions: [0, 15, 25, 35], graderCount: 2, rounds: 1 },
    { id: '30103', subjectId: 'english', subjectCode: '3', questionIndex: 3, name: '英语第3题', maxScore: 40, scoreOptions: [0, 10, 20, 30, 40], graderCount: 2, rounds: 2 }
  ];

  // 用户账号
  const users = [];

  // 管理员 (2.1)
  users.push({ id: '001', password: '123', role: 'admin', level: 0, name: '管理员1' });
  users.push({ id: '002', password: '123', role: 'admin', level: 0, name: '管理员2' });

  // 科组长 (2.2)
  subjects.forEach(s => {
    users.push({
      id: s.leaderId,
      password: '123',
      role: 'subject_leader',
      level: 1,
      subjectId: s.id,
      name: `${s.name}科组长`
    });
  });

  // 题组长 + 评卷员 (2.3, 2.4)
  // 评卷员账号规律: A010B0C (A=科目代码1/2/3, B=题号, C=评卷员序号)
  questions.forEach(q => {
    // 题组长
    users.push({
      id: q.id,
      password: '123',
      role: 'question_leader',
      level: 2,
      subjectId: q.subjectId,
      questionId: q.id,
      questionIndex: q.questionIndex,
      name: q.name + '题组长'
    });

    // 评卷员
    for (let c = 1; c <= q.graderCount; c++) {
      const graderId = `${q.subjectCode}010${q.questionIndex}0${c}`;
      users.push({
        id: graderId,
        password: '123',
        role: 'grader',
        level: 3,
        subjectId: q.subjectId,
        questionId: q.id,
        questionIndex: q.questionIndex,
        questionLeaderId: q.id,
        name: `${q.name}评卷员${c}`
      });
    }
  });

  // 学生
  const students = [];
  for (let i = 1; i <= 20; i++) {
    students.push({
      examNo: `S${String(i).padStart(4, '0')}`,
      name: `学生${i}`
    });
  }

  return {
    subjects,
    questions,
    users,
    students,
    scans: [],
    scores: []
  };
}

// 读取数据库
export function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    const data = initDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  return JSON.parse(raw);
}

// 写入数据库
export function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// 获取上传目录路径
export function getUploadDir() {
  return UPLOAD_DIR;
}
