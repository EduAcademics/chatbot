import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import AudioStreamerChatBot from "./components/AudioStreamerChatBot";
import UserInfoBox from "./components/UserInfoBox";
import { userAPI } from "./services/api";
import { syncAuthFromURL} from "./utils/authStorage";

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string>("");
  const [loginId, setLoginId] = useState<string>("");
  const [firstName, setFirstName] = useState<string>("");
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isAutoFetching, setIsAutoFetching] = useState(false);
  const [autoAuthError, setAutoAuthError] = useState<string | null>(null);

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
      const firstNameFromQuery = params.get("first_name");

      if (tokenFromQuery && loginIdFromQuery) {
        setIsAutoFetching(true);
        setAutoAuthError(null);
        localStorage.setItem("token", tokenFromQuery);
        setLoginId(loginIdFromQuery);
        if (firstNameFromQuery) {
          setFirstName(firstNameFromQuery);
        }

        try {
          const response = await userAPI.fetch({
            login_id: loginIdFromQuery,
          });
          if (response.status === "success" && response.user_id) {
            setUserId(response.user_id);
            setRoles(response.user_roles || "");
            if (response.first_name) {
              setFirstName(response.first_name);
            }
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF8F2] via-[#FFE4C8] to-[#FFC98A] px-4 py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="bg-white/55 backdrop-blur-2xl rounded-3xl shadow-[0_8px_32px_rgba(245,130,31,0.16)] border border-white/65 px-8 py-6 md:px-10 md:py-8 flex flex-col items-center gap-4"
        >
          <img 
            src="/sofisto-img.png" 
            alt="Schools OS AI" 
            className="w-16 h-16 md:w-20 md:h-20 object-contain"
          />
          <p className="text-[rgba(61,40,23,0.78)] text-sm md:text-base font-medium">
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
            element={<Navigate to="/" />}
          />
        {/* <Route path="/test-attendance" element={<AttendanceTest />} /> */}
        <Route
          path="/"
          element={
              <MainLayout
                userId={userId}
                loginId={loginId}
                firstName={firstName}
                roles={roles}
                autoAuthError={autoAuthError}
                onUserFetched={(id, r, fetchedLoginId, fetchedFirstName) => {
                  setUserId(id);
                  setRoles(r);
                  setLoginId(fetchedLoginId);
                  setFirstName(fetchedFirstName || "");
                  setAutoAuthError(null);
                }}
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
  firstName,
  roles,
  autoAuthError,
  onUserFetched,
}: {
  userId: string | null;
  loginId: string;
  firstName: string;
  roles: string;
  autoAuthError: string | null;
  onUserFetched: (
    id: string,
    r: string,
    loginId: string,
    firstName?: string,
  ) => void;
}) => {
  return (
    <>
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
          firstName={firstName}
        />
      )}
    </>
  );
};

export default App;
