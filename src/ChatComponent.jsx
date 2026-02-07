import React, { useState, useEffect, useRef } from 'react';
import { getDeepSeekResponse } from './services/deepseekService';
import { io } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
import { aiPersonality } from './services/aiPersonality';
import { PersonalityModal, AddMcpModal, MemoryModal, FeaturesModal } from './components/ChatModals';
import './ChatComponent.css';
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
const socket = io('http://localhost:3334');
const SESSION_ID = "user_001"; // 暂时硬编码，后续可以根据登录用户动态获取
const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);


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
  // 初始化加载记忆
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await axios.get(`http://localhost:3334/chat/history/${SESSION_ID}`);
        if (res.data.success && res.data.messages) {
          setMessages(res.data.messages);
          setSummary(res.data.summary || "");
        }
      } catch (err) {
        console.error("加载历史记录失败:", err);
      }
    };
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

  const handleSend = async () => {
    if (!input.trim()) return;

    setError('');
    const userMessage = {
      role: 'user',
      content: input,
    };

    // 1. 构造发给 AI 的 Payload
    let payload = [];
    if (summary) {
      payload.push({
        role: 'system',
        content: `【长期记忆背景】：${summary}`
      });
    }
    const updatedMessagesWithUser = [...messages, userMessage];
    payload.push(...updatedMessagesWithUser);

    // 立即更新 UI 显示用户消息
    setMessages(updatedMessagesWithUser);
    setInput('');
    setIsLoading(true);

    try {
      // 2. 第一步：只等待 AI 的回复
      const response = await getDeepSeekResponse(payload);

      const assistantMessage = {
        role: 'assistant',
        content: response,
      };
      const finalMessages = [...updatedMessagesWithUser, assistantMessage];

      // --- 【关键改动点 1】：AI 回复一拿到，立刻更新消息列表并关闭转圈 ---
      setMessages(finalMessages);
      setIsLoading(false);

      // --- 【关键改动点 2】：静默保存，不再使用 await 阻塞 UI ---
      // 我们去掉 await，让它在后台运行
      axios.post('http://localhost:3334/chat/save', {
        sessionId: SESSION_ID,
        messages: finalMessages
      }).then(saveRes => {
        // 保存成功后，更新摘要和可能的截断列表
        if (saveRes.data.success && saveRes.data.summary) {
          setSummary(saveRes.data.summary);
          if (saveRes.data.isCompressed) {
            // 如果触发了压缩，替换历史记录，用户无感
            setMessages(saveRes.data.messages || finalMessages.slice(-4));
          }
        }
      }).catch(err => {
        console.error('后台保存失败，但对话不受影响:', err);
      });

    } catch (error) {
      console.error('Error in handleSend:', error);
      setError('Failed to get response from DeepSeek API.');
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request.',
      };
      setMessages(prev => [...prev, errorMessage]);
      // 报错也要关闭加载状态
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
      const res = await axios.get(`http://localhost:3334/chat/history/${SESSION_ID}`);
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
        const res = await axios.post(`http://localhost:3334/chat/clear/${SESSION_ID}`);
        // if (res.data.success) {
        //   // ✨ 同步清空前端的所有状态
        //   setMessages([]);      // 清空聊天气泡列表
        //   setSummary("");       // 清空摘要状态
        //   setMemoryContent("记忆已清空"); // 更新你的记忆显示区内容

        //   alert("AI 记忆已成功重置");
        // }
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
console.log(configData,'configData')
      const res = await axios.post(`http://localhost:3334/mcp/save-config`, configData);
      if (res.data.success) {
        alert("配置保存成功！");
        setShowAddMcpModal(false);
      }
    } catch (e) {

      console.error(e,"eeee")
      alert("保存失败，请检查 JSON 格式或网络",e);
    }
  };
  // 可用功能列表
  const availableFeatures = [
    {
      name: "天气查询",
      description: "获取指定城市的实时天气信息",
      example: "现在适合去黑龙江旅游吗"
    },
    {
      name: "地点搜索",
      description: "查询指定城市的场所信息（餐饮、酒店、景点、商铺等）",
      example: "深圳龙岗区塘坑地铁站附近的肯德基有哪些"
    },
    {
      name: "车站查询",
      description: "查询指定城市的车站信息",
      example: "深圳市的车站有哪些"
    }
  ];

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
        features={availableFeatures}
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
        />
        <button className="send-btn" onClick={handleSend} disabled={isLoading}>
          {isLoading ? <div className="loading-spin" /> : "发送 →"}
        </button>
      </footer>
    </div>
  );
};

export default ChatComponent;