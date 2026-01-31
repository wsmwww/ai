// 统一配置管理文件

// DeepSeek API Key
export const DEEPSEEK_API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY;

// OpenAI API Key (预留)
export const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// 高德地图API Key
export const AMAP_API_KEY = import.meta.env.VITE_AMAP_API_KEY;

// 天气API Key
export const WEATHER_API_KEY = import.meta.env.VITE_WEATHER_API_KEY;

// MCP代理服务URL
export const MCP_PROXY_URL = import.meta.env.VITE_MCP_PROXY_URL || 'http://localhost:3334';

// 其他配置
export const CONFIG = {
  // API请求超时时间（毫秒）
  API_TIMEOUT: 30000,
  
  // 默认返回结果数量
  DEFAULT_PAGE_SIZE: 10,
  
  // 消息历史记录最大长度
  MAX_MESSAGE_HISTORY: 50
};
