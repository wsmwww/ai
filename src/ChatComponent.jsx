import React, { useState, useEffect, useRef } from 'react';
import { getDeepSeekResponse } from './services/deepseekService';
import { io } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import { aiPersonality } from './services/aiPersonality';
import { PersonalityModal, AddMcpModal, MemoryModal, FeaturesModal } from './components/ChatModals';
import './ChatComponent.css';
import { MCP_PROXY_URL } from './config';
// 添加全局样式
if (!document.getElementById('chat-component-styles')) {
  const style = document.createElement('style');
  style.id = 'chat-component-styles';
  style.textContent = `
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
        'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
        sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      overflow: hidden;
    }
      .markdown-container table {
  border-collapse: collapse;
  width: 100%;
  margin: 12px 0;
  font-size: 14px;
}
.markdown-container th, .markdown-container td {
  border: 1px solid #e0e0e0;
  padding: 10px;
  text-align: left;
}
.markdown-container th {
  background-color: #f7f9fc;
  font-weight: 600;
  color: #333;
}
.markdown-container tr:nth-child(even) {
  background-color: #fafafa;
}
  @media (max-width: 768px) {
    .markdown-container table {
      display: block;
      overflow-x: auto; /* 表格太宽时允许左右滑动 */
      white-space: nowrap;
    }
    .markdown-container th, .markdown-container td {
      padding: 6px 8px; /* 缩小内边距 */
      font-size: 12px;
    }
  }
  
  /* 功能按钮样式 */
  .feature-button {
    padding: 10px 20px;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    background-color: #ffffff;
    color: #2c3e50;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
  }
  
  .feature-button:hover {
    background-color: #f8f9fa;
    border-color: #3498db;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
  }
  `;
  document.head.appendChild(style);
}
const socket = io(MCP_PROXY_URL);
const SESSION_ID = "user_001"; // 暂时硬编码，后续可以根据登录用户动态获取
const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const [toolList, setToolList] = useState([]);

  // --- 新增状态：控制确认弹窗 ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [pendingReport, setPendingReport] = useState("");

  // --- 新增状态：控制记忆管理模态框 ---
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [memoryContent, setMemoryContent] = useState("");
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);

  // --- 新增状态：控制人设查看模态框 ---
  const [showPersonalityModal, setShowPersonalityModal] = useState(false);

  // --- 新增状态：控制新增MCP模态框 ---
  const [showAddMcpModal, setShowAddMcpModal] = useState(false);
  const [mcpJsonContent, setMcpJsonContent] = useState('{}');

  // --- 新增状态：控制功能列表弹窗 ---
  const [showFeaturesModal, setShowFeaturesModal] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  // 流式处理
  const [history, setHistory] = useState([]); // 确保它永远是个数组
  // 初始化加载记忆
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await axios.get(`${MCP_PROXY_URL}/chat/history/${SESSION_ID}`);
        if (res.data.success && res.data.messages) {
          setMessages(res.data.messages);
          setSummary(res.data.summary || "");
        }
      } catch (err) {
        console.error("加载历史记录失败:", err);
      }
    };
    // 初始化加载工具列表
    const loadToolList = async () => {
      try {
        const res = await axios.get(`${MCP_PROXY_URL}/mcp/list-all-tools`);
        console.log("工具列表:", res.data.tools);
        if (res.data.success && res.data.tools) {
          setToolList(res.data.tools);
        }
      } catch (err) {
        console.error("加载工具列表失败:", err);
      }
    };
    loadToolList();
    loadHistory();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // 监听后端发来的“待确认日报”
    socket.on("request_report_confirm", (data) => {
      console.log("📬 收到后端生成的日报内容");
      setPendingReport(data.content);
      setShowConfirmModal(true); // 自动弹出确认框
    });

    // 监听发送结果
    socket.on("report_status", (res) => {
      if (res.success) {
        alert("✅ 邮件已成功发送到您的邮箱！");
      } else {
        alert("❌ 发送失败: " + res.msg);
      }
    });

    return () => {
      socket.off("request_report_confirm");
      socket.off("report_status");
    };
  }, []);
  const handleApprove = () => {
    socket.emit("approve_send_daily"); // 告诉后端：可以发了
    setShowConfirmModal(false);
  };
  const handleReject = () => {
    socket.emit("reject_send_daily"); // 告诉后端：不发了，取消
    setShowConfirmModal(false);
  };
  const [summary, setSummary] = useState("");
  const handleKeyDown = (e) => {
    console.log(e.key)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleSend = async () => {
    if (!input.trim()) return;

    // 1. 立即展示用户消息
    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // 2. 预设一条空的 AI 消息，准备填入内容
    const aiMsgId = Date.now();
    setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', isPlanning: true }]);

    try {
      // 3. 调用我们新写的流式接口
      const response = await fetch('http://localhost:3334/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...history, userMsg] })
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentFullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') break;

            const data = JSON.parse(dataStr);
            currentFullContent += data.content;

            // 4. 关键：实时更新 AI 的回复内容
            setMessages(prev => prev.map(m =>
              m.id === aiMsgId ? { ...m, content: currentFullContent } : m
            ));
          }
        }
      }
    } catch (err) {
      console.error("读取流失败:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理功能点击，自动输入到输入框
  const handleFeatureClick = (example) => {
    setInput(example);
  };

  // --- 记忆管理功能 ---  
  // 打开记忆管理模态框
  const handleOpenMemoryModal = async () => {
    setIsLoadingMemory(true);
    try {
      const res = await axios.get(`${MCP_PROXY_URL}/chat/history/${SESSION_ID}`);
      if (res.data.success) {
        // 更新本地 summary，用于判断是否展示“摘抄”
        setSummary(res.data.summary || "");
        // 确保 messages 也是最新的，用于展示“列表”
        setMessages(res.data.messages || []);
      }
    } catch (err) {
      console.error("加载记忆失败:", err);
    } finally {
      setIsLoadingMemory(false);
      setShowMemoryModal(true);
    }
  };

  // 清空AI记忆
  const handleClearMemory = async () => {
    if (window.confirm("确定要清空 AI 记忆并删除当前聊天记录吗？")) {
      try {
        const res = await axios.post(`${MCP_PROXY_URL}/chat/clear/${SESSION_ID}`);
        if (res.data.success) {
          // 存储摘要
          setSummary(res.data.summary || "");
          // 存储对话列表（用于在没摘要时展示列表）
          setMessages(res.data.messages || []);

          // 设置弹窗内显示的文字描述
          if (res.data.summary) {
            setMemoryContent(res.data.summary);
          } else {
            setMemoryContent("当前对话尚未触发深度总结，以下为近期记录：");
          }
        }
      } catch (err) {
        console.error("清空记忆失败:", err);
        alert("操作失败，请检查后端连接");
      }
    }
  };

  // 打开人设查看模态框
  const handleOpenPersonalityModal = () => {
    setShowPersonalityModal(true);
  };

  // 打开新增MCP模态框
  const handleOpenAddMcpModal = () => {
    setMcpJsonContent('{}');
    setShowAddMcpModal(true);
  };

  // 打开功能列表弹窗
  const handleOpenFeaturesModal = () => {
    setShowFeaturesModal(true);
  };
  const handleSaveMcp = async () => {
    try {
      const configData = JSON.parse(mcpJsonContent);
      // 假设 JSON 格式为: { "mcpKey": "weather", "name": "天气服务", "url": "...", "apiKey": "..." }
      console.log(configData, 'configData')
      const res = await axios.post(`${MCP_PROXY_URL}/mcp/save-config`, configData);
      if (res.data.success) {
        alert("配置保存成功！");
        setShowAddMcpModal(false);
      }
    } catch (e) {

      console.error(e, "eeee")
      alert("保存失败，请检查 JSON 格式或网络", e);
    }
  };

  return (
    <div className='layout'>
      {/* 邮箱模态框 */}
      {showConfirmModal && (
        <div className="modal-overlay">
          <div className="modal-card confirm">
            <h3>日报自动生成确认</h3>
            <p>AI 已经为您汇总好内容，请确认是否发送邮件：</p>
            <div className="preview-box">{pendingReport}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="nav-btn" style={{ backgroundColor: '#eee', color: '#333' }} onClick={handleReject}>取消发送</button>
              <button className="send-btn" onClick={handleApprove}>确认发送邮件</button>
            </div>
          </div>
        </div>
      )}

      {/* 记忆管理模态框 */}
      <MemoryModal
        isOpen={showMemoryModal}
        onClose={() => setShowMemoryModal(false)}
        isLoading={isLoadingMemory}
        summary={summary}
        messages={messages}
        onClear={handleClearMemory}
      />

      {/* 人设查看模态框 */}
      <PersonalityModal
        isOpen={showPersonalityModal}
        onClose={() => setShowPersonalityModal(false)}
        content={aiPersonality.content}
      />

      {/* 新增MCP模态框 */}
      <AddMcpModal
        isOpen={showAddMcpModal}
        onClose={() => setShowAddMcpModal(false)}
        mcpJsonContent={mcpJsonContent}
        setMcpJsonContent={setMcpJsonContent}
        onSave={handleSaveMcp}
      />

      <div className='header'>
        <div className='header-box'>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div className='ai-title'>
              AI
            </div>
            <span>智能对话助手</span>
          </div>
          <div className='ai-title-box'>
            <span>DeepSeek AI</span>
            <div className='version'>
              专业版
            </div>
            <button
              onClick={handleOpenMemoryModal}
              className='memory'
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 1)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(52, 152, 219, 0.8)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              记忆管理
            </button>
            <button
              onClick={handleOpenPersonalityModal}
              className='character'
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(155, 89, 182, 1)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(155, 89, 182, 0.8)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              查看人设
            </button>
            <button
              onClick={handleOpenAddMcpModal}
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(46, 204, 113, 0.8)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(46, 204, 113, 1)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(46, 204, 113, 0.8)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              新增MCP
            </button>
          </div>
        </div>
      </div>

      {/* 功能列表按钮 */}
      <section className="feature-bar">
        <button
          className="feature-button"
          onClick={handleOpenFeaturesModal}
        >
          可用功能
        </button>
      </section>

      {/* 功能列表弹窗 */}
      <FeaturesModal
        isOpen={showFeaturesModal}
        onClose={() => setShowFeaturesModal(false)}
        features={toolList}
        onFeatureClick={handleFeatureClick}
      />

      {/* 错误提示 */}
      {error && (
        <div className='error'>
          <span style={{ fontWeight: '500' }}>错误:</span>
          {error}
        </div>
      )}

      {/* 聊天区域 */}
      <div className='chat-window'>
        {summary && (
          <div className="memory-card-container">
            <div style={{ fontWeight: 'bold', color: '#856404', fontSize: '13px' }}>
              🧠 已摘抄历史核心记忆：
            </div>
            <div style={{ fontSize: '12px', color: '#856404', marginTop: '5px' }}>
              {summary}
            </div>
            <div className="abstract">
              <span style={{ fontSize: '11px', color: '#b78110' }}>--- 以上为历史压缩数据，以下为最新对话 ---</span>
            </div>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            style={{
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: window.innerWidth < 768 ? '90%' : (message.role === 'user' ? '70%' : '80%'),
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{
              fontSize: '12px',
              color: '#6c757d',
              marginBottom: '4px',
              alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {message.role === 'user' ? '您' : '助手'}
            </div>
            <div
              style={{
                padding: '20px 24px',
                borderRadius: message.role === 'user'
                  ? '20px 20px 6px 20px'
                  : '20px 20px 20px 6px',
                backgroundColor: message.role === 'user' ? '#3498db' : '#ffffff',
                color: message.role === 'user' ? '#ffffff' : '#212529',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                border: message.role === 'assistant' ? '1px solid #e9ecef' : 'none',
                lineHeight: '1.6',
                //  增加溢出滚动，防止表格撑破布局
                overflowX: 'auto',
              }}
            >
              {/*  使用 ReactMarkdown 渲染助手的消息 */}
              {message.role === 'user' ? (
                <p style={{ margin: 0, wordBreak: 'break-word', fontSize: '15px' }}>
                  {message.content}
                </p>
              ) : (
                <div className="markdown-container" style={{ fontSize: '15px' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className='ai-left'>
            <div className='aiName'>
              助手
            </div>
            <div className='processing-box'>
              <div className='processing-text' />
              <p style={{ margin: 0, fontStyle: 'italic', fontSize: '15px' }}>
                正在处理您的请求...
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <footer className="input-footer">
        <input
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="请输入您的问题..."
          onKeyDown={handleKeyDown}
        />
        {/* 回车发送 */}
        <button className="send-btn" onClick={handleSend} disabled={isLoading} >
          {isLoading ? <div className="loading-spin" /> : "发送 →"}
        </button>
      </footer>
    </div>
  );
};

export default ChatComponent;