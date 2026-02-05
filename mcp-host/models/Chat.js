import mongoose from 'mongoose';

const ChatSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, unique: true },
    messages: [
        {
            role: String,      // 'user', 'assistant', 'system', 'tool'
            content: String,
            tool_calls: Array, // 存储 AI 调用工具的记录
            tool_call_id: String,
            name: String       // 工具名称
        }
    ],
    updatedAt: { type: Date, default: Date.now }
});

export const Chat = mongoose.model('Chat', ChatSchema);