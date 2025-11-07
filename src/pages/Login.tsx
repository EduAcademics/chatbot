import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { FiEye, FiEyeOff, FiLock, FiMail, FiCheck } from 'react-icons/fi';
import { authAPI } from '../services/api';

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [emailValid, setEmailValid] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  useEffect(() => {
    if (formData.email) {
      setEmailValid(validateEmail(formData.email));
    } else {
      setEmailValid(false);
    }
  }, [formData.email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const data = await authAPI.login(formData);
      localStorage.setItem('token', data.token);
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const isFormValid = formData.email.trim() !== '' && formData.password.trim() !== '';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8f6f3] via-[#faf8f6] to-[#efeae4] px-4 py-6 md:py-10 relative overflow-hidden">
      {/* Animated background elements - inspired by modern design */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating gradient orbs */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-64 h-64 md:w-96 md:h-96 bg-gradient-to-br from-[#D4A574]/20 to-[#C9A882]/10 rounded-full blur-3xl"
          animate={{
            x: [0, 30, 0],
            y: [0, -20, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      <motion.div
          className="absolute bottom-1/4 right-1/4 w-64 h-64 md:w-96 md:h-96 bg-gradient-to-br from-[#C9A882]/20 to-[#D4A574]/10 rounded-full blur-3xl"
          animate={{
            x: [0, -30, 0],
            y: [0, 20, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
        {/* Decorative grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(212,165,116,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(212,165,116,0.03)_1px,transparent_1px)] bg-[size:50px_50px] md:bg-[size:80px_80px]" />
      </div>

      {/* Chatbot illustration - decorative element */}
      <motion.div
        className="absolute top-10 right-4 md:top-20 md:right-20 w-20 h-20 md:w-32 md:h-32 opacity-10 md:opacity-20"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="w-full h-full bg-gradient-to-br from-[#D4A574] to-[#C9A882] rounded-full flex items-center justify-center text-4xl md:text-6xl">
          🤖
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative w-full max-w-md bg-white/80 backdrop-blur-2xl rounded-3xl md:rounded-[2rem] shadow-2xl border border-white/60 px-6 py-8 md:px-10 md:py-12 z-10
          before:absolute before:inset-0 before:rounded-3xl md:before:rounded-[2rem] before:bg-gradient-to-br before:from-[#D4A574]/5 before:via-transparent before:to-transparent before:pointer-events-none"
      >
        {/* Header with chatbot icon */}
        <div className="flex flex-col items-center mb-4 md:mb-5">
          <motion.div
            className="w-14 h-14 md:w-18 md:h-18 mb-3 bg-gradient-to-br from-[#D4A574] to-[#C9A882] rounded-2xl flex items-center justify-center shadow-lg"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          >
            <span className="text-2xl md:text-3xl">🤖</span>
          </motion.div>
        <motion.h1
            className="text-center bg-gradient-to-r from-[#D4A574] via-[#C9A882] to-[#D4A574] bg-clip-text text-transparent text-xl md:text-2xl font-bold mb-1"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
        >
          Welcome Back
        </motion.h1>
        <motion.p
            className="text-center text-[#8B7355] text-xs md:text-sm mb-4 md:mb-5 font-normal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
        >
            Sign in to continue to Sofisto AI
        </motion.p>
        </div>

        {error && (
          <motion.div
            className="bg-red-50 border-l-4 border-red-400 text-red-700 p-3 rounded-lg mb-4 text-sm font-medium shadow-sm"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="flex items-center gap-2">
              <span className="text-red-500">⚠</span>
              <span>{error}</span>
            </div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4 md:space-y-4">
          <motion.div 
            className="relative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
          >
            <label className="block text-sm font-medium text-[#8B7355] mb-1.5 ml-1">
              Email Address
            </label>
            <div className="relative">
              <div
                className={`absolute left-4 top-1/2 -translate-y-1/2 z-[2] pointer-events-none transition-colors duration-300 flex items-center justify-center ${
                  emailFocused 
                    ? 'text-[#D4A574] drop-shadow-[0_0_8px_rgba(212,165,116,0.4)]' 
                    : 'text-[#C9A882]/70'
                }`}
              >
                <motion.div
                  animate={{
                    scale: emailFocused ? 1.15 : 1,
                  }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <FiMail size={20} className="md:w-5 md:h-5" />
                </motion.div>
              </div>
              
              {emailValid && formData.email && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[2] pointer-events-none flex items-center justify-center">
                  <motion.div
                    initial={{ opacity: 0, scale: 0, rotate: -180 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    className="w-5 h-5 md:w-6 md:h-6 bg-green-500 rounded-full flex items-center justify-center shadow-lg"
                  >
                    <FiCheck size={12} className="text-white" />
                  </motion.div>
                </div>
              )}
              
            <input
              type="email"
                placeholder="Enter your email address"
              value={formData.email}
              onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
              required
              autoFocus
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                className={`w-full pl-12 md:pl-14 ${emailValid && formData.email ? 'pr-12 md:pr-14' : 'pr-4'} py-3.5 md:py-4 rounded-xl md:rounded-2xl text-sm md:text-base outline-none transition-all duration-300
                  ${
                    emailFocused
                      ? 'border-2 border-[#D4A574] bg-gradient-to-br from-[#fffefb] to-white shadow-[0_0_0_4px_rgba(212,165,116,0.1),0_4px_12px_rgba(212,165,116,0.15)]'
                      : emailValid && formData.email
                      ? 'border-2 border-green-400 bg-white shadow-[0_0_0_2px_rgba(34,197,94,0.1),0_2px_8px_rgba(34,197,94,0.1)]'
                      : 'border border-[#E8E0D6] bg-white/90 hover:bg-white hover:border-[#D4A574]/50 shadow-sm'
                  } text-[#5a4a3a] placeholder:text-[#C9A882]/50`}
            />
          </div>

            {formData.email && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -5 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                className={`mt-2 text-xs font-medium flex items-center gap-1 ${
                  emailValid ? 'text-green-600' : 'text-red-500'
                }`}
              >
                <span>{emailValid ? '✓' : '✗'}</span>
                <span>{emailValid ? 'Valid email format' : 'Please enter a valid email address'}</span>
              </motion.div>
            )}
          </motion.div>

          <motion.div 
            className="relative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            <label className="block text-sm font-medium text-[#8B7355] mb-1.5 ml-1">
              Password
            </label>
            <div className="relative">
              <div
                className={`absolute left-4 top-1/2 -translate-y-1/2 z-[2] pointer-events-none transition-colors duration-300 flex items-center justify-center ${
                  passwordFocused 
                    ? 'text-[#D4A574] drop-shadow-[0_0_8px_rgba(212,165,116,0.4)]' 
                    : 'text-[#C9A882]/70'
                }`}
              >
                <motion.div
                  animate={{
                    scale: passwordFocused ? 1.15 : 1,
                  }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <FiLock size={20} className="md:w-5 md:h-5" />
                </motion.div>
              </div>
              
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              value={formData.password}
              onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                className={`w-full pl-12 md:pl-14 pr-12 md:pr-14 py-3.5 md:py-4 rounded-xl md:rounded-2xl text-sm md:text-base outline-none transition-all duration-300
                  ${
                    passwordFocused
                      ? 'border-2 border-[#D4A574] bg-gradient-to-br from-[#fffefb] to-white shadow-[0_0_0_4px_rgba(212,165,116,0.1),0_4px_12px_rgba(212,165,116,0.15)]'
                      : 'border border-[#E8E0D6] bg-white/90 hover:bg-white hover:border-[#D4A574]/50 shadow-sm'
                  } text-[#5a4a3a] placeholder:text-[#C9A882]/50`}
              />
              
              <div className="absolute right-4 top-1/2 -translate-y-1/2 z-[3] flex items-center justify-center">
                <motion.button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
                  className="bg-transparent border-none text-[#8B7355] cursor-pointer p-2 rounded-lg flex items-center justify-center transition-colors
                    hover:text-[#D4A574] hover:bg-[#D4A574]/10"
                  whileHover={{ scale: 1.1, rotate: showPassword ? 0 : 5 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {showPassword ? <FiEyeOff size={20} className="md:w-5 md:h-5" /> : <FiEye size={20} className="md:w-5 md:h-5" />}
                </motion.button>
              </div>
          </div>
          </motion.div>

          <motion.button
            type="submit"
            disabled={isLoading || !isFormValid}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className={`group relative w-full py-4 md:py-4.5 rounded-xl md:rounded-2xl text-white border-none font-semibold text-base md:text-lg transition-all duration-300 flex items-center justify-center gap-3 overflow-hidden
              ${
                isFormValid && !isLoading
                  ? 'bg-gradient-to-r from-[#D4A574] via-[#C9A882] to-[#D4A574] cursor-pointer shadow-lg shadow-[#D4A574]/30 hover:shadow-xl hover:shadow-[#D4A574]/40'
                  : 'bg-[#E0D5C4] cursor-not-allowed opacity-60 shadow-none'
              }`}
            whileHover={isFormValid && !isLoading ? { scale: 1.02, y: -2 } : {}}
            whileTap={isFormValid && !isLoading ? { scale: 0.98 } : {}}
          >
            {/* Shimmer effect on hover */}
            {isFormValid && !isLoading && (
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              />
            )}
            
            {isLoading ? (
              <>
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 md:w-6 md:h-6 border-2 border-white/30 border-t-white rounded-full"
                />
                <span className="relative z-10">Signing in...</span>
              </>
            ) : (
              <>
                <span className="relative z-10">Sign In</span>
                <motion.span
                  animate={{ x: [0, 4, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  className="relative z-10 text-xl"
                >
                  →
                </motion.span>
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
