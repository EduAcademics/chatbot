import { motion } from 'framer-motion';
import { useState } from 'react';
import { FiEye, FiEyeOff, FiLock, FiUser } from 'react-icons/fi';
const apiBase = import.meta.env.VITE_API_BASE_URL;
const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBase}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Login failed');
      }

      localStorage.setItem('token', data.token);
      window.location.href = '/'; // Change this to force page reload
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Button should be disabled if either field is empty
  const isFormValid = formData.email.trim() !== '' && formData.password.trim() !== '';

  return (
    <div className="login-container">
      {/* Enhanced School-themed animated SVGs */}
      <div className="school-anim-bg" aria-hidden="true">
        {/* Book */}
        <motion.svg
          className="anim-book"
          width="60"
          height="60"
          viewBox="0 0 60 60"
          fill="none"
          initial={{ y: 0, rotate: -10, opacity: 0.7 }}
          animate={{ y: [0, -18, 0], rotate: [-10, 10, -10], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
        >
          <rect x="10" y="15" width="40" height="30" rx="6" fill="#fbbf24" stroke="#f59e42" strokeWidth="2" />
          <rect x="15" y="20" width="30" height="20" rx="3" fill="#fff" stroke="#fbbf24" strokeWidth="1" />
        </motion.svg>
        {/* Pencil */}
        <motion.svg
          className="anim-pencil"
          width="50"
          height="50"
          viewBox="0 0 50 50"
          fill="none"
          initial={{ y: 0, rotate: 8, opacity: 0.7 }}
          animate={{ y: [0, 14, 0], rotate: [8, -8, 8], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 1.5 }}
        >
          <rect x="10" y="30" width="28" height="8" rx="3" fill="#f87171" stroke="#b91c1c" strokeWidth="1" />
          <polygon points="38,30 46,25 46,33 38,38" fill="#fde68a" stroke="#f59e42" strokeWidth="1" />
          <polygon points="10,30 6,29 6,39 10,38" fill="#fff" stroke="#d1d5db" strokeWidth="1" />
        </motion.svg>
        {/* Paper plane */}
        <motion.svg
          className="anim-plane"
          width="54"
          height="54"
          viewBox="0 0 54 54"
          fill="none"
          initial={{ y: 0, rotate: 0, opacity: 0.7 }}
          animate={{ y: [0, -12, 0], rotate: [0, 12, 0], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 8, ease: "easeInOut", delay: 3 }}
        >
          <polygon points="5,27 49,7 27,49" fill="#60a5fa" stroke="#2563eb" strokeWidth="2" />
          <polyline points="27,49 22,32 49,7" fill="none" stroke="#2563eb" strokeWidth="2" />
        </motion.svg>
        {/* Ruler */}
        <motion.svg
          className="anim-ruler"
          width="70"
          height="18"
          viewBox="0 0 70 18"
          fill="none"
          initial={{ x: 0, y: 0, rotate: -5, opacity: 0.6 }}
          animate={{ x: [0, 20, 0], y: [0, -8, 0], rotate: [-5, 10, -5], opacity: [0.6, 1, 0.6] }}
          transition={{ repeat: Infinity, duration: 9, ease: "easeInOut", delay: 2 }}
        >
          <rect x="2" y="2" width="66" height="14" rx="3" fill="#a7f3d0" stroke="#059669" strokeWidth="2" />
          {[...Array(12)].map((_, i) => (
            <rect key={i} x={6 + i * 5} y="4" width="1" height={i % 2 === 0 ? "10" : "6"} fill="#059669" />
          ))}
        </motion.svg>
        {/* Globe */}
        <motion.svg
          className="anim-globe"
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          initial={{ y: 0, scale: 1, opacity: 0.7 }}
          animate={{ y: [0, 10, 0], scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 10, ease: "easeInOut", delay: 4 }}
        >
          <circle cx="24" cy="24" r="18" fill="#a5b4fc" stroke="#6366f1" strokeWidth="2" />
          <ellipse cx="24" cy="24" rx="12" ry="18" fill="none" stroke="#6366f1" strokeWidth="1" />
          <ellipse cx="24" cy="24" rx="18" ry="6" fill="none" stroke="#6366f1" strokeWidth="1" />
        </motion.svg>
        {/* Bouncing Ball */}
        <motion.svg
          className="anim-ball"
          width="28"
          height="28"
          viewBox="0 0 28 28"
          fill="none"
          initial={{ y: 0, opacity: 0.8 }}
          animate={{ y: [0, 30, 0], opacity: [0.8, 1, 0.8] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut", delay: 2.5 }}
        >
          <circle cx="14" cy="14" r="12" fill="#f472b6" stroke="#be185d" strokeWidth="2" />
          <path d="M14 2 A12 12 0 0 1 26 14" stroke="#fff" strokeWidth="2" fill="none" />
        </motion.svg>
        {/* Chalk dust effect */}
        <div className="chalk-dust">
          {[...Array(18)].map((_, i) => (
            <motion.span
              key={i}
              className="dust"
              initial={{ opacity: 0, x: 0, y: 0, scale: 0.7 }}
              animate={{
                opacity: [0, 0.7, 0],
                x: [0, Math.sin(i) * 30, 0],
                y: [0, -30 - i * 2, 0],
                scale: [0.7, 1.2, 0.7]
              }}
              transition={{
                repeat: Infinity,
                duration: 3 + (i % 4),
                delay: i * 0.3,
                ease: "easeInOut"
              }}
            />
          ))}
        </div>
      </div>

      <motion.div
        className="login-card chalk-border"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        whileHover={{ scale: 1.025, boxShadow: "0 8px 32px rgba(99,102,241,0.18)" }}
        transition={{ duration: 0.5 }}
      >
        <motion.h1
          className="login-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          Login AI ChatBot
        </motion.h1>

        {error && (
          <motion.div
            className="error-message"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className={`input-group floating-label ${formData.email ? 'filled' : ''}`}>
            <FiUser className="input-icon" />
            <input
              type="email"
              id="login-email"
              placeholder=" "
              value={formData.email}
              onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              autoFocus
            />
            <label htmlFor="login-email">Email</label>
          </div>

          <div className={`input-group floating-label ${formData.password ? 'filled' : ''}`}>
            <FiLock className="input-icon" />
            <input
              type={showPassword ? "text" : "password"}
              id="login-password"
              placeholder=" "
              value={formData.password}
              onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
            />
            <label htmlFor="login-password">Password</label>
            <button
              type="button"
              className="password-toggle"
              tabIndex={-1}
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>

          <motion.button
            className="login-button"
            type="submit"
            disabled={isLoading || !isFormValid}
            whileHover={isFormValid && !isLoading ? { scale: 1.04, boxShadow: "0 6px 20px #6366f155" } : {}}
            whileTap={isFormValid && !isLoading ? { scale: 0.98 } : {}}
            style={{
              opacity: isFormValid && !isLoading ? 1 : 0.6,
              cursor: isFormValid && !isLoading ? 'pointer' : 'not-allowed'
            }}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </motion.button>
        </form>
      </motion.div>

      <style>{`
        .login-container {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #e0e7ff 0%, #f5f7fa 100%);
          padding: 1rem;
          position: relative;
          overflow: hidden;
        }

        .login-container::before {
          content: '';
          position: absolute;
          width: 200%;
          height: 200%;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle, rgba(99,102,241,0.13) 0%, transparent 60%);
          animation: pulse 15s infinite;
          z-index: 0;
        }

        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
          50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.2; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; }
        }

        .login-card {
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(16px);
          padding: 2.5rem 2rem 2rem 2rem;
          border-radius: 1.25rem;
          box-shadow: 0 8px 32px rgba(99,102,241,0.08), 0 2px 8px rgba(0,0,0,0.06);
          width: 100%;
          max-width: 410px;
          position: relative;
          z-index: 1;
          transition: box-shadow 0.3s, transform 0.2s;
        }

        .login-card:hover {
          box-shadow: 0 12px 36px rgba(99,102,241,0.18), 0 4px 16px rgba(0,0,0,0.08);
          transform: translateY(-2px) scale(1.025);
        }

        .login-title {
          text-align: center;
          color: #1a1a1a;
          font-size: 2rem;
          margin-bottom: 2.2rem;
          letter-spacing: 0.01em;
          font-weight: 700;
          text-shadow: 0 2px 8px #6366f11a;
        }

        .input-group {
          position: relative;
          margin-bottom: 1.7rem;
          transition: transform 0.2s;
          display: flex;
          align-items: center;
        }

        .input-group:hover {
          transform: translateY(-2px) scale(1.01);
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          top: 50%;
          transform: translateY(-50%);
          color: #6366f1;
          font-size: 1.2rem;
          z-index: 2;
          pointer-events: none;
        }

        .floating-label input {
          width: 100%;
          padding: 1.1rem 1rem 1.1rem 2.7rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.7rem;
          font-size: 1.05rem;
          background: rgba(255,255,255,0.98);
          transition: border 0.2s, box-shadow 0.2s;
          box-shadow: 0 1px 4px #6366f10a;
        }

        .floating-label input:focus {
          outline: none;
          border-color: #6366f1;
          box-shadow: 0 0 0 4px #6366f122;
        }

        .floating-label label {
          position: absolute;
          left: 2.7rem;
          top: 50%;
          transform: translateY(-50%);
          color: #9ca3af;
          font-size: 1rem;
          pointer-events: none;
          background: transparent;
          transition: 0.18s cubic-bezier(.4,0,.2,1);
          padding: 0 0.2rem;
          z-index: 3;
        }

        .floating-label input:focus + label,
        .floating-label.filled label {
          top: 0.2rem;
          left: 2.5rem;
          font-size: 0.82rem;
          color: #6366f1;
          background: #fff;
          padding: 0 0.3rem;
          border-radius: 0.2rem;
        }

        .password-toggle {
          position: absolute;
          right: 1rem;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: #6b7280;
          cursor: pointer;
          padding: 0;
          font-size: 1.15rem;
          z-index: 4;
          transition: color 0.18s;
        }

        .password-toggle:hover {
          color: #6366f1;
        }

        .login-button {
          width: 100%;
          padding: 0.9rem;
          background: linear-gradient(90deg, #6366f1 0%, #60a5fa 100%);
          color: white;
          border: none;
          border-radius: 0.7rem;
          font-size: 1.08rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s, box-shadow 0.3s;
          position: relative;
          overflow: hidden;
          box-shadow: 0 2px 8px #6366f122;
          letter-spacing: 0.01em;
        }

        .login-button:disabled {
          background: linear-gradient(90deg, #a5b4fc 0%, #bae6fd 100%);
          color: #e5e7eb;
          cursor: not-allowed;
          box-shadow: none;
        }

        .login-button::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.18),
            transparent
          );
          transition: 0.5s;
        }

        .login-button:hover:not(:disabled)::before {
          left: 100%;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-2px) scale(1.04);
          box-shadow: 0 8px 24px #6366f133;
        }

        .error-message {
          background: #fee2e2;
          color: #dc2626;
          padding: 0.75rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
          font-size: 0.95rem;
          box-shadow: 0 1px 4px #dc262622;
        }

        .school-anim-bg {
          position: absolute;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 0;
        }

        .anim-book {
          position: absolute;
          left: 8vw;
          top: 18vh;
          opacity: 0.7;
          filter: drop-shadow(0 2px 8px #fbbf2433);
        }

        .anim-pencil {
          position: absolute;
          right: 10vw;
          bottom: 15vh;
          opacity: 0.7;
          filter: drop-shadow(0 2px 8px #f8717133);
        }

        .anim-plane {
          position: absolute;
          left: 60vw;
          top: 8vh;
          opacity: 0.7;
          filter: drop-shadow(0 2px 8px #60a5fa33);
        }

        .anim-ruler {
          position: absolute;
          left: 20vw;
          bottom: 8vh;
          opacity: 0.6;
          filter: drop-shadow(0 2px 8px #a7f3d033);
        }

        .anim-globe {
          position: absolute;
          right: 12vw;
          top: 10vh;
          opacity: 0.7;
          filter: drop-shadow(0 2px 8px #a5b4fc33);
        }

        .anim-ball {
          position: absolute;
          left: 45vw;
          bottom: 10vh;
          opacity: 0.8;
          filter: drop-shadow(0 2px 8px #f472b633);
        }

        .chalk-dust {
          position: absolute;
          left: 0; top: 0; width: 100%; height: 100%;
          pointer-events: none;
          z-index: 1;
        }

        .chalk-dust .dust {
          position: absolute;
          left: 50vw;
          top: 60vh;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #fff;
          opacity: 0.5;
          filter: blur(2px);
        }

        .login-card.chalk-border {
          box-shadow:
            0 0 0 4px #fff,
            0 0 0 8px #6366f1,
            0 8px 32px rgba(99,102,241,0.08),
            0 2px 8px rgba(0,0,0,0.06);
          border: 2.5px dashed #fff;
          position: relative;
          z-index: 2;
          animation: chalk-glow 2.5s infinite alternate;
        }

        @keyframes chalk-glow {
          0% { box-shadow: 0 0 0 4px #fff, 0 0 0 8px #6366f1, 0 8px 32px rgba(99,102,241,0.08), 0 2px 8px rgba(0,0,0,0.06);}
          100% { box-shadow: 0 0 0 8px #fff, 0 0 0 12px #6366f1, 0 8px 32px rgba(99,102,241,0.12), 0 2px 8px rgba(0,0,0,0.10);}
        }

        @media (max-width: 640px) {
          .login-card {
            padding: 1.5rem 0.8rem 1.2rem 0.8rem;
          }

          .login-title {
            font-size: 1.4rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;
