import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiLogOut } from "react-icons/fi";
import Login from "./pages/Login";
import AudioStreamerChatBot from "./components/AudioStreamerChatBot";
import UserInfoBox from "./components/UserInfoBox";
import { userAPI } from "./services/api";

// import AttendanceTest from "./pages/AttendanceTest";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem("token")
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [autoAuthError, setAutoAuthError] = useState<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  useEffect(() => {
    const initializeAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenFromQuery = params.get("token");
      const emailFromQuery = params.get("email");

      if (tokenFromQuery && emailFromQuery) {
        setIsAutoFetching(true);
        setAutoAuthError(null);
        localStorage.setItem("token", tokenFromQuery);
        setIsAuthenticated(true);
        setUserEmail(emailFromQuery);

        try {
          const response = await userAPI.fetch({ email: emailFromQuery });
          if (response.status === "success" && response.user_id) {
            setUserId(response.user_id);
            setRoles(response.user_roles || "");
            window.history.replaceState({}, document.title, window.location.pathname);
          } else {
            throw new Error(response.message || "Unable to fetch user details.");
          }
        } catch (error) {
          console.error("Auto-authentication failed:", error);
          setAutoAuthError(
            error instanceof Error ? error.message : "Authentication failed."
          );
        } finally {
          setIsAutoFetching(false);
          setIsAuthResolved(true);
        }
        return;
      }

      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        setIsAuthenticated(true);
      }
      setIsAuthResolved(true);
    };

    initializeAuth();
  }, []);

  if (!isAuthResolved || isAutoFetching) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8f6f3] via-[#faf8f6] to-[#efeae4] px-4 py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/60 px-8 py-6 md:px-10 md:py-8 flex flex-col items-center gap-4"
        >
          <span className="text-3xl md:text-4xl">🤖</span>
          <p className="text-[#8B7355] text-sm md:text-base font-medium">
            Preparing your chat experience...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={!isAuthenticated ? <Login /> : <Navigate to="/" />}
          />
        {/* <Route path="/test-attendance" element={<AttendanceTest />} /> */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <>
                <div className="absolute top-4 right-4 z-10 flex gap-2.5">
                  <motion.button
                    onClick={handleLogout}
                    className="w-11 h-11 bg-[#C9A882] text-white border-none rounded-full cursor-pointer flex items-center justify-center text-xl shadow-[0_2px_8px_rgba(0,0,0,0.1)] transition-all hover:scale-110 hover:bg-red-100 hover:text-red-600 hover:shadow-[0_4px_12px_rgba(220,38,38,0.2)]"
                    title="Logout"
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <FiLogOut />
                  </motion.button>
                </div>
                {!userId ? (
                  <UserInfoBox
                    initialEmail={userEmail}
                    initialError={autoAuthError ?? undefined}
                    onUserFetched={(id, r, email) => {
                      setUserId(id);
                      setRoles(r);
                      setUserEmail(email);
                      setAutoAuthError(null);
                    }}
                  />
                ) : (
                  <AudioStreamerChatBot
                    userId={userId}
                    roles={roles}
                    email={userEmail}
                  />
                )}
              </>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

export default App;
