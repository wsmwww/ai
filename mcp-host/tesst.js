// tesst.js - 魔塔MCP代理服务
import express from 'express';
import cors from 'cors';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import os from 'os';
import path from 'path';
import fs from 'fs';
const app = express();
app.use(cors());
app.use(express.json());
import nodemailer from 'nodemailer';
import cron from 'node-cron';
import { runCronReport } from './cronAgent.js';

import { Server } from "socket.io";
import http from "http";


const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // 允许你的 React 前端连接
});

let pendingReportTask = null;

// ==================== Socket 实时通信逻辑 ====================
io.on("connection", (socket) => {
    console.log("📱 前端交互页面已连接，准备好推送确认弹窗");

    // 接收前端点击“确认发送”的指令
    socket.on("approve_send_daily", async () => {
        if (pendingReportTask) {
            console.log("🚀 收到用户确认，开始正式发送邮件...");
            try {
                // 调用你代码中已有的发送逻辑
                const mailOptions = {
                    from: '1799706863@qq.com',
                    to: '1799706863@qq.com',
                    subject: '今日工作日报 (已确认)',
                    text: pendingReportTask.content
                };
                await transporter.sendMail(mailOptions);
                socket.emit("report_status", { success: true, msg: "邮件已飞向邮箱！" });
                pendingReportTask = null; // 清空任务
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

// 魔塔MCP配置（从您提供的JSON配置中获取）
const MODEL_SCOPE_MCP_URL = "https://mcp.api-inference.modelscope.net/9581e69d396b47/mcp";
const MODEL_SCOPE_API_KEY = "ms-726c3eb4-4fa0-44ad-83b7-4b35d5e5f92b";
const MCP_CONFIGS = {
    amap: {
        name: "amap-maps",
        version: "1.0.0",
        url: "https://mcp.api-inference.modelscope.net/bdb83cf1fd8e4b/mcp",
        apiKey: "ms-726c3eb4-4fa0-44ad-83b7-4b35d5e5f92b"
    },
    ticket: {
        name: "12306-train",
        version: "1.0.0",
        url: "https://mcp.api-inference.modelscope.net/9cc7bb47810244/mcp",
        apiKey: "ms-726c3eb4-4fa0-44ad-83b7-4b35d5e5f92b"
    },
};

const mcpSessions = {};

/**
 * 初始化MCP会话
 */
async function initializeMcpSession(mcpKey, force = false) {
    const config = MCP_CONFIGS[mcpKey];
    if (!config) {
        throw new Error(`未知的 MCP: ${mcpKey}`);
    }
    if (!force && mcpSessions[mcpKey]?.isInitialized) {
        return mcpSessions[mcpKey];
    }

    if (force && mcpSessions[mcpKey]?.client) {
        try {
            await mcpSessions[mcpKey].client.close();
        } catch { }
    }

    console.log(`🔌 正在连接 MCP [${mcpKey}]...`);
    const transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        {
            requestInit: {
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                },
            },
        }
    );
    const client = new Client(
        { name: config.name, version: config.version },
        { capabilities: { tools: {}, prompts: {}, resources: {} } }
    );

    await client.connect(transport);

    const toolsResult = await client.listTools();

    mcpSessions[mcpKey] = {
        client,
        tools: toolsResult.tools || [],
        isInitialized: true,
    };

    console.log(
        `✅ MCP [${mcpKey}] 初始化完成，工具数: ${mcpSessions[mcpKey].tools.length}`
    );

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
        // 👇 核心判断
        const msg = err?.message || '';
        if (
            msg.includes('SessionExpired') ||
            msg.includes('session') ||
            msg.includes('expired')
        ) {
            console.warn(`♻️ MCP [${mcpKey}] session 过期，重连中...`);

            await initializeMcpSession(mcpKey, true);

            // 👇 只重试一次
            return await mcpSessions[mcpKey].client.callTool({
                name: toolName,
                arguments: args,
            });
        }
        throw err;
    }
}

// ==================== Express API 端点 ====================

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


/**
 * 3. 调用工具端点（通用）
 */
// 1. 配置邮件发送器
const transporter = nodemailer.createTransport({
    service: 'qq', // 如果是 Gmail 就写 'gmail'
    auth: {
        user: '1799706863@qq.com',
        pass: 'xlwvmvkmvsazbhbe' // 刚才获取的 16 位授权码
    }
});
app.post('/mcp/call', async (req, res) => {
    try {
        const { mcp, tool, args } = req.body;

        if (tool === 'get_git_commits') {
            return res.json({
                success: true,
                data: [
                    { time: "10:30", message: "feat: 完成 MCP 多轮调用逻辑" },
                    { time: "14:20", message: "fix: 修复桌面路径读取失败的 bug" },
                    { time: "16:00", message: "style: 美化车票查询表格样式" }
                ]
            });
        }
        if (tool === 'save_daily_report') {
            try {
                const { content, fileName } = args; // AI 会提供日报内容和文件名
                const reportPath = path.join(os.homedir(), 'Desktop', fileName || '正式日报.txt');

                // 将 AI 生成的内容写入文件
                fs.writeFileSync(reportPath, content, 'utf-8');

                return res.json({
                    success: true,
                    data: { message: `日报已成功保存至：${reportPath}` }
                });
            } catch (error) {
                return res.json({ success: false, error: '保存失败：' + error.message });
            }
        }
        // 邮箱操作
        if (tool === 'send_daily_email') {
            try {
                const { subject, content, to } = args;
                console.log(subject, content, to, "---------")
                const mailOptions = {
                    from: '1799706863@qq.com',
                    to: to || '1799706863@qq.com', // 默认发给自己
                    subject: subject || '今日工作日报',
                    text: content // 日报内容
                };

                const info = await transporter.sendMail(mailOptions);
                console.log('📧 邮件已发送:', info.messageId);

                return res.json({
                    success: true,
                    data: { message: "邮件发送成功！", id: info.messageId }
                });
            } catch (error) {
                console.error("❌ 邮件发送失败:", error);
                return res.json({ success: false, error: '邮件发送失败: ' + error.message });
            }
        }
        const result = await callMcpTool(mcp, tool, args || {});
        const content = result?.content?.[0];
        const data = content?.type === 'json'
            ? content.data
            : content?.text ?? content;
        res.json({ success: true, mcp, tool, data, raw: result });
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
 * 5. 健康检查端点
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
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
const PORT = process.env.PORT || 3334;


// 20s 执行一次
cron.schedule('*/20 * * * * *', async () => {
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