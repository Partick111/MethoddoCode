/**
 * 「生活记录」页面 mock 数据（时间线展示）。
 * 按日期倒序排列；images 可选，路径为 public/images/ 下的图片。
 */
export interface MockLifeItem {
  id: string
  /** 记录日期（YYYY-MM-DD） */
  date: string
  title: string
  content: string
  /** 心情 emoji（可选，显示在标题后） */
  mood?: string
  /** 配图（可选，public/images/ 下的路径） */
  images?: string[]
}

export const MOCK_LIFE: MockLifeItem[] = [
  {
    id: 'life-5',
    date: '2026-09-12',
    title: '博客加了音乐播放器',
    content:
      '给博客左下角加了一个歌单按钮，点开就能选歌，支持单曲循环和列表循环。把喜欢的歌丢进 public/music/ 文件夹就能听，工作的时候放点轻音乐效率高不少。',
    mood: '🎧'
  },
  {
    id: 'life-4',
    date: '2026-08-30',
    title: '周末去看了猫',
    content:
      '朋友家的猫长大了不少，一下午被它黏着，拍了张照片留念。天气很好，回来的路上买了杯冰美式，久违的松弛感。',
    mood: '🐱',
    images: ['/images/art/cat.png']
  },
  {
    id: 'life-3',
    date: '2026-08-16',
    title: '完成了一个剪辑小短片',
    content:
      '把上个月的素材粗剪了一版 3 分钟的小短片，第一次尝试跟着音乐节奏卡点，比想象中难，但成片效果还挺满意的。配乐选了很久，最后用了一首很安静的钢琴曲。',
    mood: '🎬',
    images: ['/images/art/1c7b726fe720679b.jpg']
  },
  {
    id: 'life-2',
    date: '2026-07-28',
    title: '开始认真学 Vue 3',
    content:
      '把博客从静态页面重构成了 Vue 3 + TypeScript 项目，组合式 API 写起来确实顺手。踩了不少坑，比如响应式丢失、路由缓存之类，都记在文章里了，算是边做边学的记录。',
    mood: '💻',
    images: ['/images/art/a46372ff45bc5524.jpg']
  },
  {
    id: 'life-1',
    date: '2026-07-05',
    title: '换了一个新的开始',
    content:
      '把旧的博客关掉重新搭了一个，想让它更像自己的一个小窝：写文章、放音乐、记录生活。慢慢填内容吧，希望这份热情能坚持得久一点。',
    mood: '🌱'
  }
]
