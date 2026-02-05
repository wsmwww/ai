import React, { useState, useEffect, useRef } from 'react';
import { getDeepSeekResponse } from './services/deepseekService';
import { io } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import axios from 'axios';
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
        // 保存成功后，悄悄更新摘要和可能的截断列表
        if (saveRes.data.success && saveRes.data.summary) {
          setSummary(saveRes.data.summary);
          if (saveRes.data.isCompressed) {
            // 如果触发了压缩，悄悄替换历史记录，用户无感
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
      // 加载AI记忆
      const res = await axios.get(`http://localhost:3334/chat/history/${SESSION_ID}`);
      if (res.data.success) {
        setMemoryContent(res.data.summary || "暂无记忆");
      }
    } catch (err) {
      console.error("加载记忆失败:", err);
      setMemoryContent("加载记忆失败");
    } finally {
      setIsLoadingMemory(false);
      setShowMemoryModal(true);
    }
  };

  // 清空AI记忆
  const handleClearMemory = async () => {
    if (window.confirm("确定要清空AI记忆吗？此操作不可恢复。")) {
      try {
        const res = await axios.post(`http://localhost:3334/chat/clear/${SESSION_ID}`);
        if (res.data.success) {
          setMemoryContent("记忆已清空");
          setSummary("");
          alert("AI记忆已成功清空");
        }
      } catch (err) {
        console.error("清空记忆失败:", err);
        alert("清空记忆失败，请稍后重试");
      }
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      margin: 0,
      padding: 0,
      border: 'none',
      borderRadius: 0,
      overflow: 'hidden',
      backgroundColor: '#ffffff',
    }}>
      {/* 顶部导航栏 */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '16px',
            width: '95%',
            maxWidth: '600px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}>
            <h3 style={{ margin: 0, color: '#2c3e50' }}>🤖 日报自动生成确认</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>AI 已经为您汇总好内容，请确认是否发送邮件：</p>

            <div style={{
              flex: 1, overflowY: 'auto', backgroundColor: '#f8f9fa',
              padding: '15px', borderRadius: '8px', border: '1px solid #ddd',
              whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.6'
            }}>
              {pendingReport}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={handleReject}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd',
                  cursor: 'pointer', backgroundColor: '#eee'
                }}
              >
                取消发送
              </button>
              <button
                onClick={handleApprove}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  cursor: 'pointer', backgroundColor: '#3498db', color: 'white', fontWeight: 'bold'
                }}
              >
                确认发送邮件
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 记忆管理模态框 */}
      {showMemoryModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '16px',
            width: '95%',
            maxWidth: '800px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px', fontWeight: '600' }}>🧠 AI 记忆管理</h3>
              <button
                onClick={() => setShowMemoryModal(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  cursor: 'pointer',
                  backgroundColor: '#f8f9fa',
                  fontSize: '14px'
                }}
              >
                关闭
              </button>
            </div>
            
            <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
              这里显示AI对当前会话的记忆摘要，您可以查看或清空这些记忆。
            </p>

            <div style={{
              flex: 1, overflowY: 'auto', backgroundColor: '#f8f9fa',
              padding: '20px', borderRadius: '12px', border: '1px solid #ddd',
              whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.6',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
            }}>
              {isLoadingMemory ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: '2px solid #3498db',
                    borderTop: '2px solid transparent',
                    animation: 'spin 1s linear infinite',
                  }} />
                </div>
              ) : (
                memoryContent || "暂无记忆内容"
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setShowMemoryModal(false)}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd',
                  cursor: 'pointer', backgroundColor: '#f8f9fa', fontSize: '14px'
                }}
              >
                取消
              </button>
              <button
                onClick={handleClearMemory}
                style={{
                  padding: '10px 20px', borderRadius: '8px', border: 'none',
                  cursor: 'pointer', backgroundColor: '#e74c3c', color: 'white', 
                  fontSize: '14px', fontWeight: '500',
                  transition: 'all 0.2s ease-in-out'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#c0392b';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#e74c3c';
                }}
              >
                清空记忆
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div style={{
        backgroundColor: '#1a2530',
        padding: '0 32px',
        borderBottom: '1px solid #e0e0e0',
        fontSize: '18px',
        fontWeight: '600',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',

        boxSizing: 'border-box',
      }}>
        <div style={{
          display: 'flex',
          height: '70px',
          width: '100%',
          justifyContent: 'space-between',
          gap: '12px',
          marginTop: '16px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            <div style={{
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              backgroundColor: '#3498db',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: '700',
            }}>
              AI
            </div>
            <span>智能对话助手</span>
          </div>
          <div style={{
            fontSize: '14px',
            opacity: 0.8,
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}>
            <span>DeepSeek AI</span>
            <div style={{
              fontSize: '12px',
              padding: '4px 12px',
              borderRadius: '12px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
            }}>
              专业版
            </div>
            <button
              onClick={handleOpenMemoryModal}
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                borderRadius: '8px',
                backgroundColor: 'rgba(52, 152, 219, 0.8)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
              }}
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
          </div>
        </div>
      </div>

      {/* 功能列表 */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '0 16px',
        borderBottom: '2px solid #e0e0e0',
        display: 'flex',
        flexWrap: 'nowrap',
        overflowX: 'auto',
        gap: '12px',
        alignItems: 'center',
        height: '70px',
        boxSizing: 'border-box',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        <div style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#2c3e50',
          marginRight: '8px',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#3498db',
          }}></span>
          可用功能:
        </div>
        {availableFeatures.map((feature, index) => (
          <div
            key={index}
            style={{
              flexShrink: 0,
              backgroundColor: '#ffffff',
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid #e9ecef',
              fontSize: '13px',
              color: '#495057',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              minWidth: '140px',
              textAlign: 'center',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s ease-in-out',
              cursor: 'pointer',
            }}
            onClick={() => handleFeatureClick(feature.example)}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(52, 152, 219, 0.15)';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.borderColor = '#3498db';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.borderColor = '#e9ecef';
            }}
          >
            <div style={{ fontWeight: '600', marginBottom: '4px', fontSize: '13px', color: '#2c3e50' }}>{feature.name}</div>
            <div style={{ fontSize: '11px', color: '#6c757d', lineHeight: '1.2' }}>
              {feature.example}
            </div>
          </div>
        ))}
      </div>

      {/* 错误提示 */}
      {error && (
        <div style={{
          backgroundColor: '#f8d7da',
          padding: '12px 32px',
          borderBottom: '1px solid #f5c6cb',
          color: '#721c24',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{ fontWeight: '500' }}>错误:</span>
          {error}
        </div>
      )}

      {/* 聊天区域 */}
      <div style={{
        flex: 1,
        padding: '32px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        backgroundColor: '#fafafa',
        backgroundImage: 'linear-gradient(to bottom, #fafafa 0%, #f8f9fa 100%)',
      }}>
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
                // 💡 重点修改：增加溢出滚动，防止表格撑破布局
                overflowX: 'auto',
              }}
            >
              {/* 💡 重点修改：使用 ReactMarkdown 渲染助手的消息 */}
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
          <div
            style={{
              alignSelf: 'flex-start',
              maxWidth: '35%',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{
              fontSize: '12px',
              color: '#6c757d',
              marginBottom: '4px',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              助手
            </div>
            <div
              style={{
                padding: '20px 24px',
                borderRadius: '20px 20px 20px 6px',
                backgroundColor: '#ffffff',
                color: '#6c757d',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                border: '1px solid #e9ecef',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                border: '2px solid #3498db',
                borderTop: '2px solid transparent',
                animation: 'spin 1s linear infinite',
              }} />
              <p style={{ margin: 0, fontStyle: 'italic', fontSize: '15px' }}>
                正在处理您的请求...
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div style={{
        padding: '16px 32px',
        borderTop: '1px solid #e0e0e0',
        backgroundColor: '#ffffff',
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        boxShadow: '0 -1px 6px rgba(0, 0, 0, 0.05)',
      }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          style={{
            flex: 1,
            padding: '12px 20px',
            borderRadius: '8px',
            border: '1px solid #ced4da',
            outline: 'none',
            fontSize: '14px',
            backgroundColor: '#f8f9fa',
            boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.05)',
            transition: 'all 0.2s ease-in-out',
            minHeight: '44px',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3498db';
            e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.05), 0 0 0 2px rgba(52, 152, 219, 0.1)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#ced4da';
            e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0, 0, 0, 0.05)';
          }}
          placeholder="请输入您的问题..."
        />
        <button
          onClick={handleSend}
          style={{
            padding: '12px 24px',
            borderRadius: '16px',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(52, 152, 219, 0.25)',
            transition: 'all 0.2s ease-in-out',
            minWidth: '100px',
            minHeight: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2980b9';
            e.currentTarget.style.boxShadow = '0 3px 10px rgba(52, 152, 219, 0.35)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#3498db';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(52, 152, 219, 0.25)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          disabled={isLoading}
        >
          {isLoading ? (
            <div style={{
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              border: '2px solid #ffffff',
              borderTop: '2px solid transparent',
              animation: 'spin 1s linear infinite',
            }} />
          ) : (
            <>
              发送
              <span style={{ fontSize: '16px' }}>→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ChatComponent;