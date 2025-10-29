import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';

interface ClassInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (classInfo: { class_: string; section: string; date: string }) => void;
  darkMode: boolean;
}

const ClassInfoModal: React.FC<ClassInfoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  darkMode
}) => {
  const [class_, setClass] = useState('');
  const [section, setSection] = useState('');
  const [date, setDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (class_ && section && date) {
      onConfirm({ class_, section, date });
      setClass('');
      setSection('');
      setDate('');
    }
  };

  if (!isOpen) return null;
  
  console.log("ClassInfoModal is rendering, isOpen:", isOpen);

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}>
      <div style={{
        background: darkMode ? '#1a1a1a' : '#ffffff',
        borderRadius: '12px',
        padding: '2rem',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
        border: `1px solid ${darkMode ? '#333' : '#e5e7eb'}`
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem'
        }}>
          <h2 style={{
            color: darkMode ? '#f3f4f6' : '#111827',
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: '600'
          }}>
            Class Information
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: darkMode ? '#9ca3af' : '#6b7280',
              cursor: 'pointer',
              padding: '0.5rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <FiX size={20} />
          </button>
        </div>

        <p style={{
          color: darkMode ? '#9ca3af' : '#6b7280',
          margin: '0 0 1.5rem 0',
          fontSize: '0.875rem',
          lineHeight: '1.5'
        }}>
          Please provide class information to process the attendance image:
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              color: darkMode ? '#f3f4f6' : '#111827',
              fontSize: '0.875rem',
              fontWeight: '500',
              marginBottom: '0.5rem'
            }}>
              Class *
            </label>
            <input
              type="text"
              value={class_}
              onChange={(e) => setClass(e.target.value)}
              placeholder="e.g., 10, 12, NURSERY"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${darkMode ? '#444' : '#d1d5db'}`,
                borderRadius: '8px',
                background: darkMode ? '#2a2a2a' : '#ffffff',
                color: darkMode ? '#f3f4f6' : '#111827',
                fontSize: '0.875rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'block',
              color: darkMode ? '#f3f4f6' : '#111827',
              fontSize: '0.875rem',
              fontWeight: '500',
              marginBottom: '0.5rem'
            }}>
              Section *
            </label>
            <input
              type="text"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              placeholder="e.g., A, B, C"
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${darkMode ? '#444' : '#d1d5db'}`,
                borderRadius: '8px',
                background: darkMode ? '#2a2a2a' : '#ffffff',
                color: darkMode ? '#f3f4f6' : '#111827',
                fontSize: '0.875rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{
              display: 'block',
              color: darkMode ? '#f3f4f6' : '#111827',
              fontSize: '0.875rem',
              fontWeight: '500',
              marginBottom: '0.5rem'
            }}>
              Date *
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                border: `1px solid ${darkMode ? '#444' : '#d1d5db'}`,
                borderRadius: '8px',
                background: darkMode ? '#2a2a2a' : '#ffffff',
                color: darkMode ? '#f3f4f6' : '#111827',
                fontSize: '0.875rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{
            display: 'flex',
            gap: '0.75rem',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: `1px solid ${darkMode ? '#444' : '#d1d5db'}`,
                background: 'transparent',
                color: darkMode ? '#f3f4f6' : '#111827',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!class_ || !section || !date}
              style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                border: 'none',
                background: darkMode ? '#3b82f6' : '#2563eb',
                color: 'white',
                cursor: class_ && section && date ? 'pointer' : 'not-allowed',
                fontSize: '0.875rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                opacity: class_ && section && date ? 1 : 0.5
              }}
            >
              Process Image
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClassInfoModal;
