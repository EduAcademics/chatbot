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
    <div className="h-full flex-1 min-h-0 flex flex-col items-center justify-center bg-[#f8f9fc] px-4 relative overflow-hidden">
      {/* Sofisto AI Header */}
      <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] left-3 z-10 flex items-center gap-2.5 bg-white/90 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-[0_2px_12px_rgba(60,64,67,0.08)] border border-black/[0.06]">
        <img
          src="/sofisto-img.png"
          alt="Sofisto"
          className="w-9 h-9 md:w-10 md:h-10 object-contain"
        />
        <h2 className="m-0 text-[clamp(0.9rem,2vw,1.05rem)] text-[#1f1f1f] font-semibold tracking-[-0.3px]">
          Sofisto AI
        </h2>
      </div>

      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-64 h-64 md:w-96 md:h-96 bg-gradient-to-br from-violet-200/30 to-purple-100/20 rounded-full blur-3xl"
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
          className="absolute bottom-1/4 right-1/4 w-64 h-64 md:w-96 md:h-96 bg-gradient-to-br from-amber-100/30 to-orange-50/20 rounded-full blur-3xl"
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
        className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(60,64,67,0.12)] border border-black/[0.06] px-6 py-10 md:px-10 md:py-12 z-10"
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
          <h2 className="text-2xl md:text-3xl font-semibold text-[#1f1f1f] mb-1.5">
            Welcome to <span className="bg-gradient-to-r from-violet-600 to-purple-500 bg-clip-text text-transparent">Sofisto</span>
          </h2>
          <p className="text-[#5f6368] text-sm md:text-base">
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
            className={`w-full pl-4 pr-10 py-3.5 rounded-2xl text-base outline-none transition-all
              ${
                error
                  ? "border border-red-400 focus:ring-2 focus:ring-red-200"
                  : isValid
                  ? "border border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  : isFocused
                  ? "border border-violet-300 focus:ring-2 focus:ring-violet-100"
                  : "border border-black/[0.08]"
              } bg-[#f1f3f4] text-[#1f1f1f] placeholder:text-[#5f6368]/60`}
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
          className={`w-full py-3.5 rounded-2xl font-semibold text-base transition-all shadow-md flex items-center justify-center
            ${
              loginId.trim() && !isLoading && isValid
                ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:shadow-lg hover:shadow-violet-200"
                : "bg-[#e8eaed] text-[#9aa0a6] cursor-not-allowed"
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
