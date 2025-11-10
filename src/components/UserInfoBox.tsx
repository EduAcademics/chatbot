import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FiMail, FiCheck } from "react-icons/fi";
import { userAPI } from "../services/api";

interface Props {
  onUserFetched: (userId: string, roles: string, email: string) => void;
  initialEmail?: string;
  initialError?: string;
}

const UserInfoBox = ({
  onUserFetched,
  initialEmail,
  initialError,
}: Props) => {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  useEffect(() => {
    setIsValid(email ? validateEmail(email) : false);
  }, [email]);

  useEffect(() => {
    if (initialEmail) {
      setEmail(initialEmail);
    }
  }, [initialEmail]);

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  const handleFetch = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await userAPI.fetch({ email });
      if (data.status === "success" && data.user_id) {
        onUserFetched(data.user_id, data.user_roles || "", email);
      } else {
        setError(data.message || "User not found");
      }
    } catch {
      setError("Error connecting to server");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8f6f3] via-[#faf8f6] to-[#efeae4] px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md bg-white/70 backdrop-blur-xl rounded-2xl shadow-lg border border-white/40 px-6 py-10 md:px-10 md:py-12"
      >
        {/* Header */}
        <div className="text-center mb-5">
          <motion.div
            className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-[#D4A574] to-[#C9A882] rounded-2xl flex items-center justify-center shadow-lg"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <span className="text-3xl">🤖</span>
          </motion.div>
          <h2 className="text-2xl md:text-3xl font-semibold bg-gradient-to-r from-[#D4A574] via-[#C9A882] to-[#D4A574] bg-clip-text text-transparent mb-1.5">
            Welcome to <span className="text-[#b5895b]">Sofisto</span>
          </h2>
          <p className="text-[#7a6a58] text-sm md:text-base">
            Enter your email to continue
          </p>
        </div>

        {/* Input Field */}
        <div className="relative mb-5">
          <span
            className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${
              isFocused ? "text-[#c69a63]" : "text-[#b7a58c]"
            }`}
          >
            <FiMail size={18} />
          </span>

          {isValid && email && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
              <FiCheck size={16} />
            </span>
          )}

          <input
            ref={inputRef}
            type="email"
            placeholder="Enter your email address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) {
                setError(null);
              }
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && !isLoading && isValid && handleFetch()
            }
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`w-full pl-12 pr-10 py-3 rounded-xl text-base outline-none transition-all
              ${
                error
                  ? "border border-red-500 focus:ring-2 focus:ring-red-300"
                  : isValid
                  ? "border border-green-500 focus:ring-2 focus:ring-green-200"
                  : isFocused
                  ? "border border-[#d4a574] focus:ring-2 focus:ring-[#d4a574]/30"
                  : "border border-[#e5ded2]"
              } bg-white/70 text-[#5a4a3a] placeholder:text-[#a89c8e] shadow-inner`}
          />
        </div>

        {/* Continue Button */}
        <motion.button
          onClick={handleFetch}
          disabled={!email.trim() || isLoading || !isValid}
          whileHover={
            email.trim() && !isLoading && isValid
              ? { scale: 1.03, y: -2 }
              : undefined
          }
          whileTap={
            email.trim() && !isLoading && isValid ? { scale: 0.97 } : undefined
          }
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all shadow-md flex items-center justify-center
            ${
              email.trim() && !isLoading && isValid
                ? "bg-gradient-to-r from-[#d4a574] to-[#c69457] text-white hover:shadow-lg"
                : "bg-[#e9dfd2] text-white cursor-not-allowed"
            }`}
        >
          {isLoading ? (
            <>
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full mr-3"
              />
              Loading...
            </>
          ) : (
            <>
              Continue
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="ml-2 text-xl"
              >
                →
              </motion.span>
            </>
          )}
        </motion.button>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded-lg text-sm text-center"
          >
            {error}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
};

export default UserInfoBox;
