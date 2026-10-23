/**
 * 「我的项目」页面 mock 数据。
 * 后续可切换为后端接口（保持相同字段结构即可）。
 * 博主新增 / 编辑 / 删除由 projects store（localStorage）管理，id 作为稳定标识。
 */
export interface MockProject {
  id: string
  name: string
  description: string
  /** 技术栈 / 标签 */
  tags: string[]
  /** 项目地址（外链，可选；缺省则不显示访问按钮） */
  url?: string
}

export const MOCK_PROJECTS: MockProject[] = [
  {
    id: 'project-1',
    name: 'Patrick Blog 个人博客站',
    description:
      '当前站点本身：Vue 3 + TypeScript + Vite + Tailwind v4 前端，Django + DRF + JWT 后端。含文章渲染管线（shiki 代码高亮 / KaTeX 公式 / 目录 TOC）、博主内容管理、AI 助手面板与音乐播放器。',
    tags: ['Vue 3', 'TypeScript', 'Django', 'Vite'],
    url: 'http://localhost:2025'
  },
  {
    id: 'project-2',
    name: 'AI 对话助手',
    description:
      '博客内置的 AI 助手面板：右侧滑出式对话界面，登录后可用；后端已预留鉴权接口（未登录 401），对话能力待接入大模型 API。',
    tags: ['AI', 'SSE 预留', 'JWT 鉴权']
  },
  {
    id: 'project-3',
    name: '视频剪辑作品集',
    description:
      '日常视频剪辑练习与成片集：短片叙事、调色与节奏剪辑。持续更新中，精选作品将在「生活记录」中同步分享。',
    tags: ['剪辑', '调色', '短片']
  },
  {
    id: 'project-4',
    name: '本地歌单播放器',
    description:
      '站内音乐播放器组件：歌单弹窗、单曲循环 / 列表循环切换、首页卡片与左下角入口共享同一播放状态；音频文件放 public/music/ 即插即用。',
    tags: ['Audio API', 'Pinia', '组件化']
  }
]
