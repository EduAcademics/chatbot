import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FiCheck } from "react-icons/fi";
import { userAPI } from "../services/api";

interface Props {
  onUserFetched: (userId: string, roles: string, loginId: string) => void;
  initialLoginId?: string;
  initialError?: string;
}

const UserInfoBox = ({
  onUserFetched,
  initialLoginId,
  initialError,
}: Props) => {
  const [loginId, setLoginId] = useState(initialLoginId ?? "");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIsValid(!!loginId.trim());
  }, [loginId]);

  useEffect(() => {
    if (initialLoginId) {
      setLoginId(initialLoginId);
    }
  }, [initialLoginId]);

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  const handleFetch = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const data = await userAPI.fetch({ login_id: loginId.trim() });
      if (data.status === "success" && data.user_id) {
        onUserFetched(data.user_id, data.user_roles || "", loginId.trim());
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8f6f3] via-[#faf8f6] to-[#efeae4] px-4 py-6 md:py-10 relative overflow-hidden">
      {/* Sofisto AI Header */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3 bg-[#C9A882] px-4 py-2.5 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.1)]">
        <img 
          src="/sofisto-img.png" 
          alt="Sofisto" 
          className="w-10 h-10 md:w-12 md:h-12 object-contain"
        />
        <h2 className="m-0 text-[clamp(0.9rem,2vw,1.1rem)] text-white font-semibold tracking-[-0.3px]">
          Sofisto AI
        </h2>
      </div>

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
        <div className="absolute inset-0 bg-[linear-gradient(rgba(212,165,116,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(212,165,116,0.03)_1px,transparent_1px)] bg-[size:50px_50px] md:bg-[size:80px_80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 25, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md bg-white/75 backdrop-blur-2xl rounded-3xl md:rounded-[2rem] shadow-2xl border border-white/60 px-6 py-10 md:px-10 md:py-12 z-10"
      >
        {/* Header */}
        <div className="text-center mb-5">
          <motion.div
            className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-[#D4A574] to-[#C9A882] rounded-2xl flex items-center justify-center shadow-lg p-2"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            <img 
              src="/sofisto-img.png" 
              alt="Sofisto Robot" 
              className="w-full h-full object-contain"
            />
          </motion.div>
          <h2 className="text-2xl md:text-3xl font-semibold bg-gradient-to-r from-[#D4A574] via-[#C9A882] to-[#D4A574] bg-clip-text text-transparent mb-1.5">
            Welcome to <span className="text-[#b5895b]">Sofisto</span>
          </h2>
          <p className="text-[#7a6a58] text-sm md:text-base">
            Enter your Admission No / Employee ID to continue
          </p>
        </div>

        {/* Input Field */}
        <div className="relative mb-5">
          {isValid && loginId && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-500">
              <FiCheck size={16} />
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            inputMode="text"
            placeholder="Enter Admission No / Employee ID"
            value={loginId}
            onChange={(e) => {
              setLoginId(e.target.value);
              if (error) {
                setError(null);
              }
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && !isLoading && isValid && handleFetch()
            }
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className={`w-full pl-4 pr-10 py-3 rounded-xl text-base outline-none transition-all
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
          disabled={!loginId.trim() || isLoading || !isValid}
          whileHover={
            loginId.trim() && !isLoading && isValid
              ? { scale: 1.03, y: -2 }
              : undefined
          }
          whileTap={
            loginId.trim() && !isLoading && isValid ? { scale: 0.97 } : undefined
          }
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all shadow-md flex items-center justify-center
            ${
              loginId.trim() && !isLoading && isValid
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
