/**
 * ai-models.ts —— AI 助手大模型预设清单
 *
 * 用途：AI 设置弹窗中「选择厂商 + 选择模型」后自动生成接口地址（base_url），
 * 所有预设均使用 OpenAI 兼容协议（langchain-openai 直连）；
 * 选「自定义」时可手动填写任意兼容接口与模型名。
 *
 * 说明：
 * - 嵌入模型全站固定（openai:text-embedding-3-small，服务端设置），前端不提供配置；
 * - 模型清单为常见通用型号，厂商可能随时更新模型名，选「自定义」可填任意型号。
 */

export interface AIModelOption {
  label: string
  value: string
}

export interface AIProviderPreset {
  /** 厂商标识（保存到后端 provider 字段） */
  value: string
  /** 显示名 */
  label: string
  /** 接口地址（选中即自动填入，仍可手动修改） */
  baseUrl: string
  /** 该厂商常见模型 */
  models: AIModelOption[]
}

/** 大模型厂商预设（对话生成用） */
export const LLM_PROVIDERS: AIProviderPreset[] = [
  {
    value: 'deepseek',
    label: 'DeepSeek（深度求索）',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { label: 'deepseek-chat（通用对话）', value: 'deepseek-chat' },
      { label: 'deepseek-reasoner（推理增强）', value: 'deepseek-reasoner' }
    ]
  },
  {
    value: 'dashscope',
    label: '阿里云百炼（通义千问）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { label: 'qwen-plus', value: 'qwen-plus' },
      { label: 'qwen-max', value: 'qwen-max' },
      { label: 'qwen-turbo', value: 'qwen-turbo' },
      { label: 'qwen-long（长文本）', value: 'qwen-long' }
    ]
  },
  {
    value: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      { label: 'glm-4-plus', value: 'glm-4-plus' },
      { label: 'glm-4-air', value: 'glm-4-air' },
      { label: 'glm-4-flash（免费）', value: 'glm-4-flash' }
    ]
  },
  {
    value: 'moonshot',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      { label: 'moonshot-v1-8k', value: 'moonshot-v1-8k' },
      { label: 'moonshot-v1-32k', value: 'moonshot-v1-32k' },
      { label: 'moonshot-v1-128k', value: 'moonshot-v1-128k' }
    ]
  },
  {
    value: 'siliconflow',
    label: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      { label: 'deepseek-ai/DeepSeek-V3', value: 'deepseek-ai/DeepSeek-V3' },
      { label: 'deepseek-ai/DeepSeek-R1', value: 'deepseek-ai/DeepSeek-R1' },
      { label: 'Qwen/Qwen2.5-72B-Instruct', value: 'Qwen/Qwen2.5-72B-Instruct' }
    ]
  },
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { label: 'gpt-4o', value: 'gpt-4o' },
      { label: 'gpt-4o-mini', value: 'gpt-4o-mini' }
    ]
  },
  {
    value: 'ollama',
    label: '本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      { label: 'qwen2.5', value: 'qwen2.5' },
      { label: 'deepseek-r1', value: 'deepseek-r1' }
    ]
  },
  {
    value: 'custom',
    label: '自定义（手动填写）',
    baseUrl: '',
    models: []
  }
]

/** 按厂商标识找预设 */
export function findProvider(presets: AIProviderPreset[], value: string): AIProviderPreset | undefined {
  return presets.find(item => item.value === value)
}
