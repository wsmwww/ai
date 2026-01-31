// tesst.js - 魔塔MCP代理服务
import express from 'express';
import cors from 'cors';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
import cron from 'node-cron';
import { runCronReport } from './cronAgent.js';
import { sendMailInternal, localToolsLogic } from './mcpLogic.js';

import { Server } from "socket.io";
import http from "http";


const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // 允许你的 React 前端连接
});
const PORT = process.env.PORT || 3334;

let pendingReportTask = null;
// ==================== Socket 实时通信逻辑 ====================
io.on("connection", (socket) => {
    console.log("📱 前端交互页面已连接，准备好推送确认弹窗");

    // 接收前端点击“确认发送”的指令
    socket.on("approve_send_daily", async () => {
        if (pendingReportTask) {
            console.log("🚀 收到用户确认，开始正式发送邮件...");
            try {
                await sendMailInternal('今日工作日报 (已确认)', pendingReportTask.content);
                socket.emit("report_status", { success: true, msg: "邮件已飞向邮箱！" });
                pendingReportTask = null;
            } catch (error) {
                socket.emit("report_status", { success: false, msg: error.message });
            }
        }
    });

    socket.on("reject_send_daily", () => {
        console.log("🗑️ 用户取消了本次发送");
        pendingReportTask = null;
    });
});

// 魔塔MCP配置（从环境变量中读取）
const MCP_CONFIGS = {
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

const mcpSessions = {};

/**
 * 初始化MCP会话
 */
async function initializeMcpSession(mcpKey, force = false) {
    const config = MCP_CONFIGS[mcpKey];
    if (!config) throw new Error(`未知的 MCP: ${mcpKey}`);
    if (!force && mcpSessions[mcpKey]?.isInitialized) return mcpSessions[mcpKey];

    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: { Authorization: `Bearer ${config.apiKey}` } }
    });
    const client = new Client({ name: config.name, version: "1.0.0" }, { capabilities: { tools: {} } });
    await client.connect(transport);
    const toolsResult = await client.listTools();
    mcpSessions[mcpKey] = { client, tools: toolsResult.tools || [], isInitialized: true };
    return mcpSessions[mcpKey];
}

/**
 * 调用MCP工具
 */
async function callMcpTool(mcpKey, toolName, args = {}) {
    try {
        if (!mcpSessions[mcpKey]?.isInitialized) {
            await initializeMcpSession(mcpKey);
        }

        return await mcpSessions[mcpKey].client.callTool({
            name: toolName,
            arguments: args,
        });

    } catch (err) {
        // 打印原始错误，方便调试
        console.error(`❌ MCP [${mcpKey}] 调用出错:`, err.message);

        // 核心逻辑：精准匹配魔塔的 SessionExpired 错误
        const errorStr = JSON.stringify(err) || err.message || '';
        const isExpired = errorStr.includes('SessionExpired') || 
                          errorStr.includes('会话已过期') || 
                          errorStr.includes('expired');

        if (isExpired) {
            console.warn(`♻️ 检测到魔塔会话过期，正在尝试强制重连 [${mcpKey}]...`);
            
            try {
                // 1. 强制重新初始化（force = true）
                await initializeMcpSession(mcpKey, true);
                
                // 2. 重连后立即重试本次调用
                console.log(`🚀 重连成功，正在重试工具 [${toolName}]`);
                return await mcpSessions[mcpKey].client.callTool({
                    name: toolName,
                    arguments: args,
                });
            } catch (retryErr) {
                console.error(`💀 重连后重试依然失败:`, retryErr.message);
                throw retryErr;
            }
        }
        
        // 如果不是过期错误，直接抛出
        throw err;
    }
}

// ==================== API 路由 ====================

/**
 * 1. 初始化MCP服务端点
 */
app.post('/mcp/initialize', async (req, res) => {
    try {
        console.log(req.body, "req.body")
        const { mcp = 'amap' } = req.body;
        console.log("初始化MCP服务", mcp)
        const session = await initializeMcpSession(mcp);

        res.json({
            success: true,
            mcp,
            toolsCount: session.tools.length,
            tools: session.tools.map(t => t.name),
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/mcp/tools', async (req, res) => {
    const mcp = req.query.mcp || 'amap';

    try {
        const session = await initializeMcpSession(mcp);
        res.json({
            success: true,
            mcp,
            tools: session.tools,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});


app.post('/mcp/call', async (req, res) => {
    try {
        const { mcp, tool, args } = req.body;
        // 优先检查是否命中本地逻辑 (git/email/save)
        if (localToolsLogic[tool]) {
            const result = await localToolsLogic[tool](args);
            return res.json({ success: true, data: result });
        }

        const result = await callMcpTool(mcp, tool, args || {});
        res.json({ success: true, data: result.content[0] });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

/**
 * 4. 调用高德地图工具端点（便捷接口）
 */
app.post('/mcp/amap', async (req, res) => {
    try {
        const { tool, args } = req.body;

        if (!tool) {
            return res.status(400).json({
                success: false,
                error: '缺少必填参数: tool'
            });
        }

        const result = await callMcpTool(tool, args || {});

        res.json({
            success: true,
            tool: tool,
            result: result,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('高德地图工具调用失败:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            tool: req.body.tool
        });
    }
});



/**
 * 6. 状态检查端点
 */
app.get('/mcp/status', (req, res) => {
    res.json({
        success: true,
        mcps: Object.keys(MCP_CONFIGS).map(name => ({
            name,
            initialized: !!mcpInstances[name]?.initialized,
            toolsCount: mcpSessions[name]?.tools?.length || 0
        }))
    });
});

// ==================== 启动服务器 ====================

const randomMinute = Math.floor(Math.random() * 60);
// 每天19点后的某分钟执行   `${randomMinute} 19 * * 1-5`
// 30s执行 '*/30 * * * * *'
cron.schedule(`${randomMinute} 19 * * 1-5`, async () => {
    try {
        console.log("🤖 AI 正在生成日报内容...");
        // 这里的 runCronReport 内部要确保不直接调 send_daily_email
        const finalReport = await runCronReport();

        // 将内容存入待办任务
        pendingReportTask = { content: finalReport };

        // 💡 关键：通过 Socket 主动把内容推给前端，触发弹窗
        io.emit("request_report_confirm", {
            content: finalReport,
            time: new Date().toLocaleString()
        });

        console.log("📢 内容已生成，等待前端用户确认...");
    } catch (err) {
        console.error("❌ 定时任务异常:", err.message);
    }
});

console.log("⏰ 定时任务已就绪：周一至周五 18:00");
process.on('SIGTERM', async () => {
    console.log('\n🛑 收到 SIGTERM，关闭 MCP 客户端...');
    for (const session of Object.values(mcpSessions)) {
        try { await session.client.close(); } catch { }
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n🛑 收到 SIGINT，关闭 MCP 客户端...');
    for (const session of Object.values(mcpSessions)) {
        try { await session.client.close(); } catch { }
    }
    process.exit(0);
});

server.listen(PORT, () => {
    console.log(`
    ╔══════════════════════════════════════════════╗
    ║        🚀 系统已统一在端口 ${PORT} 启动         ║
    ║      HTTP 和 Socket.io 共享此端口成功          ║
    ╚══════════════════════════════════════════════╝
    `);
});