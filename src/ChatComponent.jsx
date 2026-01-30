import React, { useState, useEffect, useRef } from 'react';
import { getDeepSeekResponse } from './services/deepseekService';

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
  `;
  document.head.appendChild(style);
}

const ChatComponent = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    setError('');
    const userMessage = {
      role: 'user',
      content: input,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await getDeepSeekResponse([...messages, userMessage]);
      const assistantMessage = {
        role: 'assistant',
        content: response,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error in handleSend:', error);
      setError('Failed to get response from DeepSeek API. Please check console for details.');
      const errorMessage = {
        role: 'assistant',
        content: 'Sorry, there was an error processing your request. Please try again later.',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理功能点击，自动输入到输入框
  const handleFeatureClick = (example) => {
    setInput(example);
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
          </div>
        </div>
      </div>

      {/* 功能列表 */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '0 32px',
        borderBottom: '2px solid #e0e0e0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '24px',
        alignItems: 'center',
        height: '80px',
        boxSizing: 'border-box',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
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
              maxWidth: message.role === 'user' ? '70%' : '35%',
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
                backgroundColor: message.role === 'user'
                  ? '#3498db'
                  : '#ffffff',
                color: message.role === 'user' ? '#ffffff' : '#212529',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                border: message.role === 'assistant' ? '1px solid #e9ecef' : 'none',
                lineHeight: '1.6',
              }}
            >
              <p style={{ margin: 0, wordBreak: 'break-word', fontSize: '15px' }}>
                {message.content}
              </p>
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