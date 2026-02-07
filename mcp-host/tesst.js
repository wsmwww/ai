// tesst.js - 魔塔MCP代理服务
import express from 'express';
import cors from 'cors';
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
// 从MCP配置文件导入
const deepseekApi = axios.create({
    baseURL: 'https://api.deepseek.com/v1',
    timeout: 30000, // 总结任务可能较慢，给 30s
});

const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
    .then(() => console.log("恭喜！你的 Node 服务已成功连接到云端 MongoDB"))
    .catch(err => console.error("❌ 数据库连接失败:", err));

// 定义一个简单的 Schema 来存聊天记录
const chatSchema = new mongoose.Schema({
    sessionId: { type: String, index: true }, // 用于区分不同用户的对话
    messages: Array, // 直接存 DeepSeek 的消息数组
    summary: { type: String, default: "" }, // 存储压缩后的记忆
    lastUpdated: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

// 定义 MCP 配置 Schema  
const mcpConfigSchema = new mongoose.Schema({
    mcpKey: { type: String, unique: true, required: true }, // 如 'amap'
    name: String,
    url: String,
    apiKey: String,
    lastUpdated: { type: Date, default: Date.now }
});

const McpConfig = mongoose.model('McpConfig', mcpConfigSchema);

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
    cors: { origin: "*" } // React 前端连接
});
const PORT = process.env.PORT || 3334;

let pendingReportTask = null;
// ==================== Socket 实时通信逻辑 ====================
io.on("connection", (socket) => {
    console.log(" 前端交互页面已连接，准备好推送确认弹窗");

    // 接收前端点击“确认发送”的指令
    socket.on("approve_send_daily", async () => {
        if (pendingReportTask) {
            console.log("收到用户确认，开始正式发送邮件...");
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
        console.log(" 用户取消了本次发送");
        pendingReportTask = null;
    });
});


const mcpSessions = {};

/**
 * 初始化MCP会话
 */
async function initializeMcpSession(mcpKey, force = false) {
    // 从数据库查询
    let config = await McpConfig.findOne({ mcpKey });
    if (!config) throw new Error(`未知的 MCP: ${mcpKey}`);
    if (!config) {
        throw new Error(`未找到 [${mcpKey}] 的配置信息，请先在“新增MCP”中添加。`);
    }
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
                console.log(`重连成功，正在重试工具 [${toolName}]`);
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
/**
 * 2.查询所有已注册的MCP工具
 */
app.get('/mcp/list-all-tools', async (req, res) => {
    try {
        const allTools = [];
        // 从数据库获取所有已注册的 MCP 键名
        const configs = await McpConfig.find({}, 'mcpKey');

        for (const conf of configs) {
            const mcpKey = conf.mcpKey;
            try {
                const session = await initializeMcpSession(mcpKey);
                const formattedTools = session.tools.map(tool => ({
                    type: "function",
                    function: {
                        name: tool.name,
                        description: tool.description || '',
                        parameters: tool.inputSchema || {},
                        mcpName: mcpKey
                    }
                }));
                allTools.push(...formattedTools);
            } catch (e) {
                console.error(`加载 MCP [${mcpKey}] 失败，跳过:`, e.message);
            }
        }
        res.json({ success: true, tools: allTools });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
/**
 * 保存或更新 MCP 配置
 */
app.post('/mcp/save-config', async (req, res) => {
    try {
        let { mcpKey, name, url, apiKey } = req.body;

        // 【兼容性逻辑】：如果你传的是 { amap: { ... } }
        if (!mcpKey && Object.keys(req.body).length === 1) {
            const key = Object.keys(req.body)[0];
            const data = req.body[key];
            if (data.url) {
                mcpKey = key;
                name = data.name;
                url = data.url;
                apiKey = data.apiKey;
            }
        }

        if (!mcpKey || !url) {
            return res.status(400).json({ success: false, error: "识别失败：请确保 JSON 包含 mcpKey 和 url" });
        }

        // 存入数据库
        await McpConfig.findOneAndUpdate(
            { mcpKey },
            { mcpKey, name, url, apiKey, lastUpdated: new Date() },
            { upsert: true }
        );

        // 清理旧缓存
        if (mcpSessions[mcpKey]) delete mcpSessions[mcpKey];

        res.json({ success: true, msg: `MCP [${mcpKey}] 已更新` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
/**
 * 3.调用MCP工具
 */
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

// 1. 获取历史记录
app.get('/chat/history/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        let chat = await Chat.findOne({ sessionId });
        if (!chat) {
            // 如果没找到，返回空数组
            return res.json({ success: true, messages: [] });
        }
        res.json({ success: true, messages: chat.messages, summary: chat.summary || "" });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 2. 更新/保存记录（每次对话完调用）
app.post('/chat/save', async (req, res) => {
    try {
        const { sessionId, messages } = req.body;

        // 1. 获取数据库中已有的记录（主要是拿旧摘要）
        const doc = await Chat.findOne({ sessionId });
        const oldSummary = doc?.summary || "";

        // 2. 统计当前字数（判定是否需要压缩）
        const totalChars = messages.reduce((s, m) => s + (m.content?.length || 0), 0);

        let updateData = {
            messages: messages,
            lastUpdated: new Date()
        };

        // 3. 压缩策略：如果字数超过 4000 字符
        if (totalChars > 4000) {
            const newSummary = await generateSummary(oldSummary, messages);
            updateData.summary = newSummary;
            // 保留最后 5 条消息作为直接上下文
            updateData.messages = messages.slice(-5);
            console.log("摘要更新完毕，历史已裁切");
        }

        // 4. 更新数据库
        const result = await Chat.findOneAndUpdate(
            { sessionId },
            updateData,
            { upsert: true, new: true }
        );

        res.json({
            success: true,
            summary: result.summary, // 把最新摘要传给前端，前端下次发消息要带上
            isCompressed: totalChars > 4000
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});
// 3. 清空记忆接口
app.post('/chat/clear/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // 使用 findOneAndUpdate 将数据重置
        // upsert: true 确保如果没有记录则创建一个空的
        const result = await Chat.findOneAndUpdate(
            { sessionId },
            {
                messages: [],
                summary: "",
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(` 已清空会话记忆: ${sessionId}`);
        res.json({ success: true, message: "记忆已重置" });
    } catch (err) {
        console.error("❌ 清空记忆接口报错:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});
// 流式处理
app.post('/chat/stream', async (req, res) => {
    const { messages } = req.body;

    // 1. 设置 SSE 响应头，通知前端
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: 'deepseek-chat',
            messages: messages,
            stream: true, // 开启流式关键
            temperature: 0.7, // 稍微调高一点，让计划更有条理
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.VITE_DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            responseType: 'stream' // 必须是 stream
        });

        // 2. 监听 DeepSeek 返回的流并转发给前端
        response.data.on('data', (chunk) => {
            const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                const message = line.replace(/^data: /, '');
                if (message === '[DONE]') {
                    res.write('data: [DONE]\n\n');
                    return res.end();
                }

                try {
                    const parsed = JSON.parse(message);
                    const content = parsed.choices[0].delta.content || '';
                    if (content) {
                        // 将字传给前端
                        res.write(`data: ${JSON.stringify({ content })}\n\n`);
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        });

    } catch (error) {
        console.error("流式输出报错:", error.message);
        res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});
async function generateSummary(oldSummary, messages) {
    // 将消息数组转换为纯文本格式，方便 AI 阅读
    if (!Array.isArray(messages) || messages.length === 0) {
        console.warn("⚠️ generateSummary 收到无效的消息数组，跳过总结。");
        return oldSummary || "";
    }
    const conversationText = messages
        .filter(m => m.content) // 过滤掉没有内容的消息
        .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
        .join('\n');

    const summaryPrompt = [
        {
            role: "system",
            content: `你是一个记忆管理专家。你的任务是维护用户的【永久档案】。
        
        ### 绝对准则（不可丢失）：
        1. 身份识别：必须永久保留用户的姓名、头衔、昵称。
        2. 硬性设定：如果用户说“记住我/不能忘记”，必须原样保留在摘要中。
        3. 状态更新：将【新增对话流】中的关键信息合并到【旧摘要】中。
        
        ### 过滤规则：
        - 仅删除无意义的“哈哈”、“谢谢”、“好的”、“在吗”。
        - 删除已经完成且不再需要的过时任务步骤。

        ### 格式要求：
        - 以“用户身份：[姓名/头衔]”开头。
        - 摘要字数可放宽至 300 字。`
        },
        {
            role: "user",
            content: `【旧摘要】：${oldSummary || "无"} \n\n 【新增对话流】：\n${conversationText} \n\n 请结合以上内容生成最新的整合摘要：`
        }
    ];

    try {
        const summary = await getAIResponseSimple(summaryPrompt);
        console.log(" 生成摘要:", summary);
        return summary;
    } catch (err) {
        console.error("生成摘要失败，跳过本次压缩:", err);
        return ""; // 失败时返回空，保证主流程不崩溃
    }
}
// 纯文本 AI 调用
async function getAIResponseSimple(messages) {
    try {
        const response = await deepseekApi.post('/chat/completions', {
            model: 'deepseek-chat',
            messages: messages,
            temperature: 0.5, // 总结不需要太多创意，低随机性更稳定
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.VITE_DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const content = response.data.choices[0].message.content;
        // 去除 DeepSeek 偶尔会出现的思考标签
        return content.replace(/<｜.*?｜>/g, "").trim();
    } catch (error) {
        console.error("❌ 后端 AI 调用出错:", error.response?.data || error.message);
        throw error;
    }
}
// ==================== 启动服务器 ====================

const randomMinute = Math.floor(Math.random() * 60);
// 每天19点后的某分钟执行   `${randomMinute} 19 * * 1-5`
// 30s执行 '*/30 * * * * *'
cron.schedule(`${randomMinute} 19 * * 1-5`, async () => {
    try {
        console.log(" AI 正在生成日报内容...");
        // 这里的 runCronReport 内部要确保不直接调 send_daily_email
        const finalReport = await runCronReport();

        // 将内容存入待办任务
        pendingReportTask = { content: finalReport };

        // 💡 关键：通过 Socket 主动把内容推给前端，触发弹窗
        io.emit("request_report_confirm", {
            content: finalReport,
            time: new Date().toLocaleString()
        });

        console.log(" 内容已生成，等待前端用户确认...");
    } catch (err) {
        console.error("❌ 定时任务异常:", err.message);
    }
});

console.log(" 定时任务已就绪：周一至周五 18:00");
process.on('SIGTERM', async () => {
    console.log('\n 收到 SIGTERM，关闭 MCP 客户端...');
    for (const session of Object.values(mcpSessions)) {
        try { await session.client.close(); } catch { }
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n 收到 SIGINT，关闭 MCP 客户端...');
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
