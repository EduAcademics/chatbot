import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiLogOut } from "react-icons/fi";
import Login from "./pages/Login";
import AudioStreamerChatBot from "./components/AudioStreamerChatBot";
import UserInfoBox from "./components/UserInfoBox";

// import AttendanceTest from "./pages/AttendanceTest";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem("token"));
  const [userId, setUserId] = useState<string | null>(null);
  const [roles, setRoles] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>(""); // Add this line

  useEffect(() => {
    setIsAuthenticated(!!localStorage.getItem("token"));
  }, []);



  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/login";
  };

  return (
    <>
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
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
                  <UserInfoBox onUserFetched={(id, r, email) => { 
                    setUserId(id); 
                    setRoles(r); 
                    setUserEmail(email); 
                  }} />
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
