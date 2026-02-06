// MCP配置文件
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 魔塔MCP配置（从环境变量中读取）
export const MCP_CONFIGS = {
    amap: {
        name: "amap-maps",
        version: "1.0.0",
        url: process.env.VITE_AMAP_MCP_URL,
        apiKey: process.env.VITE_AMAP_MCP_API_KEY
    },
    ticket: {
        name: "12306-train",
        version: "1.0.0",
        url: process.env.VITE_TICKET_MCP_URL,
        apiKey: process.env.VITE_TICKET_MCP_API_KEY
    },
};
