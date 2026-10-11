import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: () => import('../views/Login.vue')
  },
  {
    path: '/app',
    component: () => import('../components/Layout.vue'),
    children: [
      {
        path: 'desktop',
        name: 'Desktop',
        component: () => import('../views/Desktop.vue')
      },
      {
        path: 'scan',
        name: 'Scan',
        component: () => import('../views/Scan.vue')
      },
      {
        path: 'grade',
        name: 'Grade',
        component: () => import('../views/Grade.vue')
      },
      {
        path: 'grade/:scanId',
        name: 'GradeTask',
        component: () => import('../views/GradeTask.vue')
      },
      {
        path: 'subject-progress',
        name: 'SubjectProgress',
        component: () => import('../views/SubjectProgress.vue')
      },
      {
        path: 'question-progress',
        name: 'QuestionProgress',
        component: () => import('../views/QuestionProgress.vue')
      },
      {
        path: 'member-comparison',
        name: 'MemberComparison',
        component: () => import('../views/MemberComparison.vue')
      },
      {
        path: 'sampling',
        name: 'Sampling',
        component: () => import('../views/Sampling.vue')
      },
      {
        path: 'accounts',
        name: 'Accounts',
        component: () => import('../views/Accounts.vue')
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const userStr = sessionStorage.getItem('currentUser')
  if (to.path !== '/' && !userStr) {
    next('/')
  } else {
    next()
  }
})

export default router
