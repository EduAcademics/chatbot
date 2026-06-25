import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiLogOut } from "react-icons/fi";
import AudioStreamerChatBot from "./components/AudioStreamerChatBot";
import UserInfoBox from "./components/UserInfoBox";
import { userAPI } from "./services/api";
import { syncAuthFromURL} from "./utils/authStorage";

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string>("");
  const [loginId, setLoginId] = useState<string>("");
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [autoAuthError, setAutoAuthError] = useState<string | null>(null);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  useEffect(() => {
    const initializeAuth = async () => {
       syncAuthFromURL();
      // const syncedFromURL = syncAuthFromURL();
      // if (syncedFromURL) {
      //   cleanAuthFromURL();
      // }


      const params = new URLSearchParams(window.location.search);
      const tokenFromQuery = params.get("token");
      const loginIdFromQuery = params.get("login_id");

      if (tokenFromQuery && loginIdFromQuery) {
        setIsAutoFetching(true);
        setAutoAuthError(null);
        localStorage.setItem("token", tokenFromQuery);
        setLoginId(loginIdFromQuery);

        try {
          const response = await userAPI.fetch({
            login_id: loginIdFromQuery,
          });
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

      setIsAuthResolved(true);
    };

    initializeAuth();
  }, []);

  if (!isAuthResolved || isAutoFetching) {
    return (
      <div className="h-dvh max-h-dvh overflow-hidden flex items-center justify-center bg-[#f5f5f7] px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white/90 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(60,64,67,0.12)] border border-black/[0.06] px-8 py-6 md:px-10 md:py-8 flex flex-col items-center gap-4"
        >
          <motion.img
            src="/sofisto-img.png"
            alt="Sofisto Robot"
            className="w-16 h-16 md:w-20 md:h-20 object-contain"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <p className="text-[#5f6368] text-sm md:text-base font-medium">
            Preparing your chat experience...
          </p>
          <div className="typing-dots">
            <span />
            <span />
            <span />
          </div>
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
            element={<Navigate to="/" />}
          />
        {/* <Route path="/test-attendance" element={<AttendanceTest />} /> */}
        <Route
          path="/"
          element={
              <MainLayout
                userId={userId}
                loginId={loginId}
                roles={roles}
                autoAuthError={autoAuthError}
                onUserFetched={(id, r, fetchedLoginId) => {
                  setUserId(id);
                  setRoles(r);
                  setLoginId(fetchedLoginId);
                  setAutoAuthError(null);
                }}
                onLogout={handleLogout}
              />
          }
        />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
    </>
  );
}

// Main Layout component
const MainLayout = ({
  userId,
  loginId,
  roles,
  autoAuthError,
  onUserFetched,
  onLogout,
}: {
  userId: string | null;
  loginId: string;
  roles: string;
  autoAuthError: string | null;
  onUserFetched: (id: string, r: string, loginId: string) => void;
  onLogout: () => void;
}) => {
  return (
    <div className="h-dvh max-h-dvh overflow-hidden relative flex flex-col bg-[#f5f5f7]">
      <NavigationButtons onLogout={onLogout} />
      {!userId ? (
        <UserInfoBox
          initialLoginId={loginId}
          initialError={autoAuthError ?? undefined}
          onUserFetched={onUserFetched}
        />
      ) : (
        <AudioStreamerChatBot
          userId={userId}
          roles={roles}
          loginId={loginId}
        />
      )}
    </div>
  );
};

// Navigation buttons component
const NavigationButtons = ({ onLogout }: { onLogout: () => void }) => {
  return (
    <div className="absolute top-[calc(0.75rem+env(safe-area-inset-top,0px))] right-3 z-50 flex gap-2">
      <motion.button
        onClick={onLogout}
        className="w-10 h-10 bg-white text-[#374151] border-none rounded-full cursor-pointer flex items-center justify-center text-lg shadow-[0_1px_4px_rgba(0,0,0,0.08)] transition-all hover:scale-105 hover:bg-red-50 hover:text-red-600"
        title="Logout"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
      >
        <FiLogOut />
      </motion.button>
    </div>
  );
};

export default App;
