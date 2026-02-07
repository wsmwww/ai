import React from 'react';
import { Tag } from 'antd';

export const FeaturesModal = ({ isOpen, onClose, features, onFeatureClick }) => {
  if (!isOpen) return null;

  return (
    <div style={modalOverlayStyle}>
      <div style={featuresCardStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px', fontWeight: '600' }}>🔧 可用功能</h3>
          <button onClick={onClose} style={closeBtnIconStyle}>关闭</button>
        </div>

        <p style={{ color: '#666', fontSize: '14px', margin: 0 }}>
          点击功能标签可自动输入示例到聊天框
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '8px' }}>
          {features.map((feature, index) => (
            <Tag
              key={index}
              color="blue"
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                cursor: 'pointer',
                borderRadius: '8px',
                transition: 'all 0.2s ease-in-out'
              }}
              onClick={() => {
                onFeatureClick(feature.example);
                onClose();
              }}
            >
              {feature.name}
            </Tag>
          ))}
        </div>
      </div>
    </div>
  );
};
// 记忆模态框
export const MemoryModal = ({
  isOpen,
  onClose,
  isLoading,
  summary,
  messages,
  onClear
}) => {
  if (!isOpen) return null;

  return (
    <div style={memoryOverlayStyle}>
      <div className='memoryCenter'>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px' }}>🧠 AI 记忆中心</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            {summary && <span style={tagDeepStyle}>深度摘抄</span>}
            <span style={tagRealtimeStyle}>实时对话</span>
          </div>
        </div>

        <div style={memoryBodyStyle}>
          {isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>加载中...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              {/* --- 第一部分：深度摘抄内容 --- */}
              {summary && (
                <div style={summaryBoxStyle}>
                  <div style={summaryTitleStyle}>📜 核心摘抄摘要</div>
                  <div style={summaryTextStyle}>{summary}</div>
                </div>
              )}

              {/* --- 分隔标识 --- */}
              {summary && (
                <div style={{ textAlign: 'center', position: 'relative' }}>
                  <hr style={{ border: 'none', borderTop: '1px dashed #ccc' }} />
                  <span style={dividerTextStyle}>以下为最新实时对话记录</span>
                </div>
              )}

              {/* --- 第二部分：对话列表记录 --- */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {!summary && <p style={{ fontSize: '12px', color: '#999', marginBottom: '5px' }}>当前对话较短，尚未触发摘抄。实时记忆如下：</p>}

                {messages.length > 0 ? (
                  messages.map((msg, i) => (
                    <div key={i} style={{
                      ...msgItemStyle,
                      borderLeft: `4px solid ${msg.role === 'user' ? '#3498db' : '#2ecc71'}`
                    }}>
                      <div style={msgHeaderStyle}>
                        <span>{msg.role === 'user' ? '用户 (USER)' : 'AI 助手 (ASSISTANT)'}</span>
                        <span style={{ fontWeight: 'normal', opacity: 0.6 }}>#{i + 1}</span>
                      </div>
                      <div style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{msg.content}</div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', color: '#ccc', fontSize: '14px', padding: '20px 0' }}>暂无对话记录</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
          <button onClick={onClose} style={secondaryBtnStyle}>关闭</button>
          <button onClick={onClear} style={deleteBtnStyle}>清空记忆</button>
        </div>
      </div>
    </div>
  );
};
// --- 人设查看模态框 ---
export const PersonalityModal = ({ isOpen, onClose, content }) => {
  if (!isOpen) return null;
  return (
    <div style={modalOverlayStyle}>
      <div className="modal-card-large" style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px', fontWeight: '600' }}>🎭 AI 人设配置</h3>
        </div>
        <p style={{ color: '#666', fontSize: '14px', margin: '10px 0' }}>
          这里显示AI的当前人设配置，包括角色定位、语言风格和行为准则。
        </p>
        <div style={contentBoxStyle}>{content}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onClose} style={secondaryBtnStyle}>关闭</button>
        </div>
      </div>
    </div>
  );
};

// --- 新增 MCP 模态框 ---
export const AddMcpModal = ({ isOpen, onClose, mcpJsonContent, setMcpJsonContent, onSave }) => {
  if (!isOpen) return null;
  return (
    <div style={modalOverlayStyle}>
      <div className="modal-card-large" style={modalCardStyle}>
        <div style={modalHeaderStyle}>
          <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px', fontWeight: '600' }}>➕ 新增 MCP 配置</h3>
          <button onClick={onClose} style={closeBtnIconStyle}>关闭</button>
        </div>
        <p style={{ color: '#666', fontSize: '14px', margin: '10px 0' }}>
          请输入MCP配置的JSON内容，包括名称、版本、URL和API密钥等信息。
        </p>
        <div style={{ flex: 1, backgroundColor: '#f8f9fa', borderRadius: '12px', border: '1px solid #ddd' }}>
          <textarea
            value={mcpJsonContent}
            onChange={(e) => setMcpJsonContent(e.target.value)}
            style={textareaStyle}
            placeholder='请输入JSON格式配置...'
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
          <button onClick={onClose} style={secondaryBtnStyle}>取消</button>
          <button onClick={onSave} style={primaryBtnStyle}>保存配置</button>
        </div>
      </div>
    </div>
  );
};

// --- 样式定义---
const modalOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 1000
};

const modalCardStyle = {
  backgroundColor: 'white', padding: '24px', borderRadius: '16px',
  width: '95%', maxWidth: '800px', maxHeight: '80vh',
  display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
};

const modalHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };

const contentBoxStyle = {
  flex: 1, overflowY: 'auto', backgroundColor: '#f8f9fa',
  padding: '20px', borderRadius: '12px', border: '1px solid #ddd',
  whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: '1.6'
};

const textareaStyle = {
  width: '100%', height: '100%', minHeight: '400px', padding: '20px',
  border: 'none', borderRadius: '12px', backgroundColor: 'transparent',
  fontSize: '14px', resize: 'none', outline: 'none', fontFamily: 'monospace'
};

const primaryBtnStyle = {
  padding: '10px 20px', borderRadius: '8px', border: 'none',
  cursor: 'pointer', backgroundColor: '#27ae60', color: 'white', fontSize: '14px'
};

const secondaryBtnStyle = {
  padding: '10px 20px', borderRadius: '8px', border: '1px solid #ddd',
  cursor: 'pointer', backgroundColor: '#f8f9fa', fontSize: '14px'
};

const closeBtnIconStyle = {
  padding: '8px 12px', borderRadius: '6px', border: '1px solid #ddd',
  cursor: 'pointer', backgroundColor: '#f8f9fa', fontSize: '14px'
};

// --- 新增记忆模态框专属样式 ---
const memoryOverlayStyle = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 2000
};

const memoryBodyStyle = {
  flex: 1, overflowY: 'auto', backgroundColor: '#f8f9fa',
  padding: '20px', borderRadius: '12px', border: '1px solid #eee', marginTop: '10px'
};

const tagDeepStyle = { fontSize: '12px', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#fff7e6', color: '#faad14', border: '1px solid #ffe58f' };
const tagRealtimeStyle = { fontSize: '12px', padding: '4px 8px', borderRadius: '4px', backgroundColor: '#e6f7ff', color: '#1890ff', border: '1px solid #91d5ff' };

const summaryBoxStyle = { padding: '16px', backgroundColor: '#fffbe6', borderRadius: '10px', border: '1px solid #ffe58f', position: 'relative' };
const summaryTitleStyle = { fontWeight: 'bold', color: '#856404', fontSize: '14px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' };
const summaryTextStyle = { lineHeight: '1.6', color: '#444', fontSize: '14px', fontStyle: 'italic' };

const dividerTextStyle = { position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#f8f9fa', padding: '0 10px', fontSize: '11px', color: '#999' };

const msgItemStyle = { padding: '10px', borderRadius: '8px', backgroundColor: '#fff', fontSize: '13px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const msgHeaderStyle = { fontWeight: 'bold', fontSize: '11px', marginBottom: '4px', color: '#888', display: 'flex', justifyContent: 'space-between' };

const deleteBtnStyle = { padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', backgroundColor: '#e74c3c', color: 'white', fontSize: '14px' };

// --- 新增功能列表专属样式 ---
const featuresCardStyle = {
  backgroundColor: 'white', padding: '24px', borderRadius: '16px',
  width: '95%', maxWidth: '600px', display: 'flex',
  flexDirection: 'column', gap: '16px', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
};

const featureItemStyle = {
  padding: '16px', borderRadius: '12px', backgroundColor: '#f8f9fa',
  border: '1px solid #e0e0e0', cursor: 'pointer', transition: 'all 0.2s ease-in-out'
};

const featureNameStyle = { 
  fontSize: '16px', fontWeight: '600', color: '#2c3e50', marginBottom: '8px' 
};

const featureExampleStyle = { 
  fontSize: '14px', color: '#666', fontStyle: 'italic' 
};